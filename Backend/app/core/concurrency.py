"""
Helpers for keeping blocking work off the event loop.

Most of this codebase's service methods are declared `async def` but perform
synchronous I/O: supabase-py is a sync client, PyGithub is sync, and several
paths call httpx's sync API. An `async def` that blocks does not yield - it
stalls *every* concurrent request on that worker's event loop for the full
duration of the call. With a GitHub round trip that can be seconds.

`run_blocking` moves such a call to the threadpool so the loop keeps serving.
"""
import functools
from typing import Any, Callable, TypeVar

import anyio.to_thread

T = TypeVar("T")


async def run_blocking(func: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    """
    Execute a blocking callable in a worker thread.

    Use this at the boundary where async code calls into a synchronous client.
    Prefer wrapping the outermost sync call rather than each inner one: one
    thread hop per operation, not per query.
    """
    if kwargs:
        func = functools.partial(func, **kwargs)
    return await anyio.to_thread.run_sync(func, *args)
