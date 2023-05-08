# Beacon
Beacon is a signal implementation for sending and receiving events.

## Signal API

### Types
```ts
type SignalParams<T> = Parameters<
	T extends unknown[] ? (...args: T) => never : T extends unknown ? (arg: T) => never : () => never
>;

type SignalCallback<T> = (...args: SignalParams<T>) => unknown;

type SignalWait<T> = T extends unknown[] ? LuaTuple<T> : T;
```

### Constructor
```ts
const signal = new Signal<T>();
```

### `Signal.Connect`
```ts
public Connect(callback: SignalCallback<T>): Connection<T>
```
Connects a callback, which will be called each time the signal is fired. The returned connection can be disconnected to stop receiving events.

### `Signal.Once`
```ts
public Once(callback: SignalCallback<T>): Connection<T>
```
Same as `Signal.Connect`, but disconnects itself after the first time it is triggered.

### `Signal.Fire`
```ts
public Fire(...args: SignalParams<T>): void
```
Fires the signal with the given event. All connected callbacks will receive the event. Internally, this uses `task.spawn` to fire each callback.

### `Signal.FireDeferred`
```ts
public FireDeferred(...args: SignalParams<T>): void
```
Same as `Signal.Fire`, except uses `task.defer` internally.

### `Signal.Wait`
```ts
public Wait(): SignalWait<T>
```
Yields the calling thread until the signal is next fired. Returns the fired event.

### `Signal.DisconnectAll`
```ts
public DisconnectAll(): void
```
Disconnects all connections on the signal.

### `Signal.Destroy`
```ts
public Destroy(): void
```
Alias for `Signal.DisconnectAll`.

## Connection API

### `Connection.Connected`
```ts
public Connected: boolean
```
Indicates if the connection is currently connected.

### `Connection.Disconnect`
```ts
public Disconnect(): void
```
Disconnects the connection.

### `Connection.Destroy`
```ts
public Destroy(): void
```
Alias for `Connection.Disconnect`.

## Example

```ts
const messenger = new Signal<string>();

const connection = messenger.Connect((msg) => {
	print(`Got message: ${msg}`);
});

messenger.Fire("Hello world!");
connection.Disconnect();
messenger.Fire("No one will see this");

// The spawned thread will wait indefinitely until the
// signal is fired. If all connections are disconnected
// using signal.Destroy() or signal.DisconnectAll(), then
// the waiting thread will be closed.
task.spawn(() => {
	const msg = messenger.Wait();
	print(`Got message from waiting: ${msg}`);
});
task.wait(2);
messenger.Fire("Hello to the waiting thread");

// Destroying isn't necessary for cleanup, but is nice when
// using signals in OOP environments for quick cleanup.
messenger.Destroy();
```

### Different number of arguments

```ts
// No args:
const signal = new Signal<void>();
signal.Connect(() => {});
signal.Fire();

// One arg:
const signal = new Signal<number>();
signal.Connect((n) => print(n));
signal.Fire(32);

// One arg, named (preferred over the above):
const signal = new Signal<[points: number]>();
signal.Connect((points) => print(points));
signal.Fire(64);

// Multiple args:
const signal = new Signal<[msg: string, value: number, cool: boolean]>();
signal.Connect((msg, value, cool) => print(msg, cool, value));
signal.Fire("hello", 10, true);
```
