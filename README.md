# Beacon
Beacon is a signal implementation for sending and receiving events.

## Signal API

### Types
```ts
type SignalParams<T> = Parameters<
	T extends unknown[] ? (...args: T) => never : T extends unknown ? (arg: T) => never : () => never
>;

type SignalCallback<T> = (...args: SignalParams<T>) => unknown;
```

### Constructor
```ts
const signal = new Signal<T>();
```

### `Signal.connect`
```ts
public connect(callback: SignalCallback<T>): Connection<T>
```
Connects a callback, which will be called each time the signal is fired. The returned connection can be disconnected to stop receiving events.

### `Signal.connectOnce`
```ts
public connectOnce(callback: SignalCallback<T>): Connection<T>
```
Same as `Signal.connect`, but disconnects itself after the first time it is triggered.

### `Signal.fire`
```ts
public fire(...args: SignalParams<T>): void
```
Fires the signal with the given event. All connected callbacks will receive the event. Internally, this uses `task.spawn` to fire each callback.

### `Signal.fireDeferred`
```ts
public fireDeferred(...args: SignalParams<T>): void
```
Same as `Signal.fire`, except uses `task.defer` internally.

### `Signal.wait`
```ts
public wait(): LuaTuple<SignalParams<T>>
```
Yields the calling thread until the signal is next fired. Returns the fired event.

### `Signal.disconnectAll`
```ts
public disconnectAll(): void
```
Disconnects all connections on the signal.

### `Signal.destroy`
```ts
public destroy(): void
```
Alias for `Signal.disconnectAll`.

## Connection API

### `Connection.connected`
```ts
public connected: boolean
```
Indicates if the connection is currently connected.

### `Connection.disconnect`
```ts
public disconnect(): void
```
Disconnects the connection.

## Example

```ts
const messenger = new Signal<string>();

const connection = messenger.connect((msg) => {
	print(`Got message: ${msg}`);
});

messenger.fire("Hello world!");
connection.disconnect();
messenger.fire("No one will see this");

// The spawned thread will wait indefinitely until the
// signal is fired. If all connections are disconnected
// using signal.destroy() or signal.disconnectAll(), then
// the waiting thread will be closed.
task.spawn(() => {
	const msg = messenger.wait();
	print(`Got message from waiting: ${msg}`);
});
task.wait(2);
messenger.fire("Hello to the waiting thread");

// Destroying isn't necessary for cleanup, but is nice when
// using signals in OOP environments for quick cleanup.
messenger.destroy();
```

### Different number of arguments

```ts
// No args:
const signal = new Signal<void>();
signal.connect(() => {});
signal.fire();

// One arg:
const signal = new Signal<number>();
signal.connect((n) => print(n));
signal.fire(32);

// Multiple args:
const signal = new Signal<[msg: string, value: number, cool: boolean]>();
signal.connect((msg, value, cool) => print(msg, cool, value));
signal.fire("hello", 10, true);
```
