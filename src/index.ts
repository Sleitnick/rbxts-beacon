export type SignalParams<T> = Parameters<
	T extends unknown[] ? (...args: T) => never : T extends unknown ? (arg: T) => never : () => never
>;
export type SignalCallback<T> = (...args: SignalParams<T>) => unknown;
export type SignalWait<T> = T extends unknown[] ? LuaTuple<T> : T;

class Connection<T> {
	public connected: boolean;
	_next?: Connection<T>;
	constructor(private signal: Signal<T>, public _fn: SignalCallback<T>) {
		this.connected = true;
	}
	public disconnect() {
		if (!this.connected) return;
		this.connected = false;
		if (this.signal._handlerListHead === this) {
			this.signal._handlerListHead = this._next;
		} else {
			let prev = this.signal._handlerListHead;
			while (prev && prev._next !== this) {
				prev = prev._next;
			}
			if (prev) {
				prev._next = this._next;
			}
		}
	}
}

export class Signal<T extends unknown[] | unknown> {
	private waitingThreads = new Set<thread>();

	_handlerListHead?: Connection<T> = undefined;

	public connect(callback: SignalCallback<T>): Connection<T> {
		const connection = new Connection(this, callback);
		if (this._handlerListHead !== undefined) {
			connection._next = this._handlerListHead;
		}
		this._handlerListHead = connection;
		return connection;
	}

	public connectOnce(callback: SignalCallback<T>): Connection<T> {
		let done = false;
		const c = this.connect((...args) => {
			if (done) return;
			done = true;
			c.disconnect();
			callback(...args);
		});
		return c;
	}

	public fire(...args: SignalParams<T>) {
		let item = this._handlerListHead;
		while (item) {
			if (item.connected) {
				task.spawn(item._fn, ...args);
			}
			item = item._next;
		}
	}

	public fireDeferred(...args: SignalParams<T>) {
		let item = this._handlerListHead;
		while (item) {
			if (item.connected) {
				task.defer(item._fn, ...args);
			}
			item = item._next;
		}
	}

	public wait(): SignalWait<T> {
		const running = coroutine.running();
		this.waitingThreads.add(running);
		let done = false;
		const c = this.connect((...args) => {
			if (done) return;
			done = true;
			c.disconnect();
			this.waitingThreads.delete(running);
			task.spawn(running, ...args);
		});
		return coroutine.yield() as SignalWait<T>;
	}

	public disconnectAll() {
		let item = this._handlerListHead;
		while (item) {
			item.connected = false;
			item = item._next;
		}
		this._handlerListHead = undefined;
		this.waitingThreads.forEach((thread) => task.cancel(thread));
		this.waitingThreads.clear();
	}

	public destroy() {
		this.disconnectAll();
	}
}
