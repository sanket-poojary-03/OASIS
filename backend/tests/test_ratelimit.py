from app.ratelimit import RateLimiter


class Clock:
    def __init__(self, t: float = 0):
        self.t = t

    def __call__(self) -> float:
        return self.t


def test_window_expiry_frees_the_ip():
    clock = Clock(1000)
    rl = RateLimiter(per_ip=2, window=600, clock=clock)
    assert rl.check("a") is None and rl.check("a") is None
    assert "Too many" in rl.check("a")
    assert rl.check("b") is None
    clock.t += 601
    assert rl.check("a") is None


def test_daily_cap_blocks_then_rolls_over():
    clock = Clock(86400 * 10)
    rl = RateLimiter(per_ip=100, daily_cap=2, clock=clock)
    assert rl.check("a") is None and rl.check("b") is None
    assert "free AI limit" in rl.check("c")
    clock.t += 86400
    assert rl.check("c") is None
