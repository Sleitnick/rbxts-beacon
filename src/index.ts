export type SignalParams<T> = Parameters<
	T extends unknown[] ? (...args: T) => never : T extends unknown ? (arg: T) => never : () => never
>;
export type SignalCallback<T> = (...args: SignalParams<T>) => unknown;
export type SignalWait<T> = T extends unknown[] ? LuaTuple<T> : T;

/**
 * Represents a connection to a signal.
 */
export class Connection<T> {
	/**
	 * Whether or not the connection is connected.
	 * @readonly
	 */
	public connected = true;

	/**
	 * @hidden
	 */
	_next?: Connection<T>;

	/**
	 * @hidden
	 */
	_fn: SignalCallback<T>;

	constructor(private signal: Signal<T>, /** @hidden */ fn: SignalCallback<T>) {
		this._fn = fn;
	}

	/**
	 * Disconnects the connection.
	 */
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

/**
 * Signals allow events to be dispatched to any number of listeners.
 */
export class Signal<T extends unknown[] | unknown> {
	private waitingThreads = new Set<thread>();

	/**
	 * @hidden
	 */
	_handlerListHead?: Connection<T> = undefined;

	/**
	 * Connects a callback. This callback will be fired when the signal
	 * is fired and will receive the arguments passed through firing.
	 * @param callback `SignalCallback<T>`
	 * @returns `Connection<T>`
	 */
	public connect(callback: SignalCallback<T>): Connection<T> {
		const connection = new Connection(this, callback);
		if (this._handlerListHead !== undefined) {
			connection._next = this._handlerListHead;
		}
		this._handlerListHead = connection;
		return connection;
	}

	/**
	 * Connects a callback, which will be disconnected after the next time
	 * the signal is fired.
	 * @param callback `SignalCallback<T>`
	 * @returns `Connection<T>`
	 */
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

	/**
	 * Fires the signal. The passed arguments will be sent along to all
	 * connected callbacks. Callbacks are invoked using `task.spawn`
	 * internally.
	 * @param args
	 */
	public fire(...args: SignalParams<T>) {
		let item = this._handlerListHead;
		while (item) {
			if (item.connected) {
				task.spawn(item._fn, ...args);
			}
			item = item._next;
		}
	}

	/**
	 * Fires the signal. The passed arguments will be sent along to all
	 * connected callbacks. Callbacks are invoked using `task.defer`
	 * internally.
	 * @param args
	 */
	public fireDeferred(...args: SignalParams<T>) {
		let item = this._handlerListHead;
		while (item) {
			if (item.connected) {
				task.defer(item._fn, ...args);
			}
			item = item._next;
		}
	}

	/**
	 * Yields the current thread until the next time the signal is fired.
	 * The arguments from firing are returned.
	 * @yields
	 * @returns `SignalWait<T>`
	 */
	public wait(): SignalWait<T> {
		const running = coroutine.running();
		this.waitingThreads.add(running);
		this.connectOnce((...args) => {
			this.waitingThreads.delete(running);
			task.spawn(running, ...args);
		});
		return coroutine.yield() as SignalWait<T>;
	}

	/**
	 * Disconnects all connections on the signal.
	 */
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

	/**
	 * Alias for `disconnectAll`.
	 */
	public destroy() {
		this.disconnectAll();
	}
}
