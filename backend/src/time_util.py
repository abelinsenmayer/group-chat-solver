from datetime import date, datetime, time, timedelta


def hours_between(later: time, earlier: time) -> float:
    """Return the hours from ``earlier`` to ``later``, allowing a single midnight wrap."""
    later_dt = datetime.combine(date.min, later)
    earlier_dt = datetime.combine(date.min, earlier)
    if later_dt < earlier_dt:
        later_dt += timedelta(days=1)
    return (later_dt - earlier_dt).total_seconds() / 3600.0


def add_hours_to_time(t: time, hours: float) -> time:
    """Add hours to a time, allowing a single midnight wrap."""
    dt = datetime.combine(date.min, t)
    dt += timedelta(hours=hours)
    return dt.time()
