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
	public Connected = true;

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
	public Disconnect() {
		if (!this.Connected) return;
		this.Connected = false;
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

	/**
	 * Alias for `Disconnect`.
	 */
	public Destroy() {
		this.Disconnect();
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
	public Connect(callback: SignalCallback<T>): Connection<T> {
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
	public Once(callback: SignalCallback<T>): Connection<T> {
		let done = false;
		const c = this.Connect((...args) => {
			if (done) return;
			done = true;
			c.Disconnect();
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
	public Fire(...args: SignalParams<T>) {
		let item = this._handlerListHead;
		while (item) {
			if (item.Connected) {
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
	public FireDeferred(...args: SignalParams<T>) {
		let item = this._handlerListHead;
		while (item) {
			if (item.Connected) {
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
	public Wait(): SignalWait<T> {
		const running = coroutine.running();
		this.waitingThreads.add(running);
		this.Once((...args) => {
			this.waitingThreads.delete(running);
			task.spawn(running, ...args);
		});
		return coroutine.yield() as SignalWait<T>;
	}

	/**
	 * Disconnects all connections on the signal.
	 */
	public DisconnectAll() {
		let item = this._handlerListHead;
		while (item) {
			item.Connected = false;
			item = item._next;
		}
		this._handlerListHead = undefined;
		this.waitingThreads.forEach((thread) => task.cancel(thread));
		this.waitingThreads.clear();
	}

	/**
	 * Alias for `DisconnectAll`.
	 */
	public Destroy() {
		this.DisconnectAll();
	}
}
