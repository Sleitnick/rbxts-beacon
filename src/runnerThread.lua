local thread = nil

local function acquireRunnerThreadAndCallEventHandler(fn, ...)
	local acquiredThread = thread
	thread = nil
	fn(...)
	thread = acquiredThread
end

local function runEventHandlerInFreeThread(fn, ...)
	acquireRunnerThreadAndCallEventHandler(fn, ...)
	while true do
		acquireRunnerThreadAndCallEventHandler(coroutine.yield())
	end
end

return {
	runnerThread = function(fn, ...)
		if not thread then
			thread = coroutine.create(runEventHandlerInFreeThread)
		end
		task.spawn(thread, fn, ...)
	end,
}
