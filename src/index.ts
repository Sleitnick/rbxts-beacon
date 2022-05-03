let freeRunnerThread: thread | undefined = undefined;

function acquireRunnerThreadAndCallEventHandler<T>(fn: Callback, arg: T) {
	const acquireRunnerThread = freeRunnerThread;
	freeRunnerThread = undefined;
	fn(arg);
	freeRunnerThread = acquireRunnerThread;
}

function runEventHandlerInFreeThread<T>(fn: Callback, arg: T) {
	acquireRunnerThreadAndCallEventHandler<T>(fn, arg);
	// eslint-disable-next-line no-constant-condition
	while (true) {
		const res = coroutine.yield() as LuaTuple<[Callback, T]>;
		acquireRunnerThreadAndCallEventHandler(res[0], res[1]);
	}
}

class Connection<T> {
	public connected: boolean;
	public _next?: Connection<T>;
	constructor(private signal: Signal<T>, public _fn: Callback) {
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

export class Signal<T> {
	private waitingThreads = new Set<thread>();

	_handlerListHead?: Connection<T> = undefined;

	public connect(callback: (event: T) => unknown): Connection<T> {
		const connection = new Connection(this, callback);
		if (this._handlerListHead !== undefined) {
			connection._next = this._handlerListHead;
		}
		this._handlerListHead = connection;
		return connection;
	}

	public connectOnce(callback: (event: T) => unknown): Connection<T> {
		let done = false;
		const c = this.connect((event: T) => {
			if (done) return;
			done = true;
			c.disconnect();
			callback(event);
		});
		return c;
	}

	public fire(event: T) {
		let item = this._handlerListHead;
		while (item) {
			if (item.connected) {
				if (!freeRunnerThread) {
					freeRunnerThread = coroutine.create(runEventHandlerInFreeThread);
				}
				task.spawn(freeRunnerThread, item._fn, event);
			}
			item = item._next;
		}
	}

	public fireDeferred(event: T) {
		let item = this._handlerListHead;
		while (item) {
			if (item.connected) {
				task.defer(item._fn, event);
			}
			item = item._next;
		}
	}

	public wait(): T {
		const running = coroutine.running();
		this.waitingThreads.add(running);
		let done = false;
		const c = this.connect((event: T) => {
			if (done) return;
			done = true;
			c.disconnect();
			this.waitingThreads.delete(running);
			task.spawn(running, [event] as LuaTuple<[T]>);
		});
		return (coroutine.yield() as LuaTuple<[T]>)[0];
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
