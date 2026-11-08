from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Callable


class RateLimiter:
    def __init__(self, per_ip: int = 20, window: float = 600, daily_cap: int = 300, clock: Callable[[], float] = time.time):
        self.per_ip, self.window, self.daily_cap, self.clock = per_ip, window, daily_cap, clock
        self.hits: dict[str, deque[float]] = defaultdict(deque)
        self.day: int | None = None
        self.count = 0

    def check(self, ip: str, own_key: bool = False) -> str | None:
        """`own_key`: the player brought their own AI key, so the server's daily budget neither applies nor counts it."""
        now = self.clock()
        day = int(now // 86400)
        if day != self.day:
            self.day, self.count = day, 0
        if self.count >= self.daily_cap and not own_key:
            return "Today's free AI limit is used up. Add your own Sarvam API key on the start screen to keep going, or try again tomorrow."
        q = self.hits[ip]
        while q and now - q[0] > self.window:
            q.popleft()
        if len(q) >= self.per_ip:
            return "Too many requests. Wait a few minutes."
        q.append(now)
        if not own_key:
            self.count += 1
        return None
