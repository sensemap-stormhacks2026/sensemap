"""SenseMap Raspberry Pi sensor agent.

Runs on a Pi with optional CircuitPython sensors, or on any laptop in simulator
mode. The JSON contract is identical in both modes so the dashboard never has
to care which hardware is attached.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import signal
import statistics
import time
import urllib.error
import urllib.request
from collections import deque
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Protocol


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Reader(Protocol):
    name: str
    is_live: bool

    def read(self) -> float: ...


class SimulatedReader:
    is_live = False

    def __init__(
        self,
        name: str,
        center: float,
        spread: float,
        period: float,
        unit: str | None = None,
    ):
        self.name = name
        self.center = center
        self.spread = spread
        self.period = period
        self.unit = unit
        self.started = time.monotonic()

    def read(self) -> float:
        phase = (time.monotonic() - self.started) / self.period
        wave = math.sin(phase * math.tau) * self.spread * 0.65
        return self.center + wave + random.uniform(-self.spread * 0.2, self.spread * 0.2)


class BH1750Reader:
    name = "light"
    is_live = True
    unit = "lux"

    def __init__(self) -> None:
        import adafruit_bh1750  # type: ignore[import-not-found]
        import board  # type: ignore[import-not-found]

        self.sensor = adafruit_bh1750.BH1750(board.I2C())

    def read(self) -> float:
        return float(self.sensor.lux)


def connect_grove_adc(test_channel: int):
    """Connect to either revision of the Grove Base Hat ADC."""
    from grove.adc import ADC  # type: ignore[import-not-found]

    configured = os.getenv("GROVE_ADC_ADDRESS")
    addresses = [int(configured, 0)] if configured else [0x08, 0x04]
    last_error: BaseException | None = None
    for address in addresses:
        try:
            adc = ADC(address)
            adc.read(test_channel)
            print(f"[sensemap] Grove Base Hat detected at 0x{address:02x}")
            return adc
        except (IOError, OSError, SystemExit) as exc:
            last_error = exc
    raise RuntimeError(f"Grove Base Hat not found at 0x08 or 0x04: {last_error}")


class GroveLightReader:
    """Reads the Grove Light Sensor v1.2 as a relative percentage."""

    name = "light"
    is_live = True
    unit = "relative"

    def __init__(self, channel: int = 0) -> None:
        self.channel = channel
        self.adc = connect_grove_adc(channel)

    def read(self) -> float:
        # grove.py returns a 0–1000 ratio. Keep the UI honest by showing 0–100%.
        return min(100.0, max(0.0, float(self.adc.read(self.channel)) / 10.0))


class GroveSoundReader:
    """Measures Grove Sound Sensor v1.6 peak-to-peak activity over 250 ms."""

    name = "sound"
    is_live = True

    def __init__(self, channel: int = 2) -> None:
        self.channel = channel
        self.adc = connect_grove_adc(channel)
        self.gain = float(os.getenv("GROVE_SOUND_GAIN", "0.35"))

    def read(self) -> float:
        samples = []
        deadline = time.monotonic() + 0.25
        while time.monotonic() < deadline:
            samples.append(float(self.adc.read(self.channel)))
        if len(samples) < 2:
            return 0.0
        samples.sort()
        low = samples[max(0, int(len(samples) * 0.05) - 1)]
        high = samples[min(len(samples) - 1, int(len(samples) * 0.95))]
        return min(100.0, max(0.0, (high - low) * self.gain))


class DHT22Reader:
    name = "temperature"
    is_live = True

    def __init__(self, pin_name: str = "D4") -> None:
        import adafruit_dht  # type: ignore[import-not-found]
        import board  # type: ignore[import-not-found]

        pin = getattr(board, pin_name)
        self.sensor = adafruit_dht.DHT22(pin, use_pulseio=False)

    def read(self) -> float:
        value = self.sensor.temperature
        if value is None:
            raise RuntimeError("DHT22 returned no temperature")
        return float(value)


class MCP3008SoundReader:
    """Reads normalized amplitude from an analog sound module through MCP3008."""

    name = "sound"
    is_live = True

    def __init__(self, channel: int = 0) -> None:
        import adafruit_mcp3xxx.mcp3008 as MCP  # type: ignore[import-not-found]
        import board  # type: ignore[import-not-found]
        import busio  # type: ignore[import-not-found]
        import digitalio  # type: ignore[import-not-found]
        from adafruit_mcp3xxx.analog_in import AnalogIn  # type: ignore[import-not-found]

        spi = busio.SPI(clock=board.SCK, MISO=board.MISO, MOSI=board.MOSI)
        cs = digitalio.DigitalInOut(board.D5)
        mcp = MCP.MCP3008(spi, cs)
        pins = [MCP.P0, MCP.P1, MCP.P2, MCP.P3, MCP.P4, MCP.P5, MCP.P6, MCP.P7]
        self.input = AnalogIn(mcp, pins[channel])

    def read(self) -> float:
        samples = []
        deadline = time.monotonic() + 0.2
        while time.monotonic() < deadline:
            samples.append(float(self.input.value))
        if not samples:
            return 0.0
        midpoint = statistics.mean(samples)
        rms = math.sqrt(statistics.mean((value - midpoint) ** 2 for value in samples))
        return min(100.0, rms / 327.68)


@dataclass
class Reading:
    timestamp: str
    device_id: str
    room_id: str
    lux: float
    light_unit: str
    sound_level: float
    temperature_c: float
    people_estimate: int
    source: str
    quality: float


class SensorNode:
    def __init__(self, simulate: bool = False) -> None:
        self.device_id = os.getenv("SENSEMAP_DEVICE_ID", "pi-demo-01")
        self.room_id = os.getenv("SENSEMAP_ROOM_ID", "aq-3000")
        self.people = int(os.getenv("SENSEMAP_PEOPLE", "18"))
        self.readers: dict[str, Reader] = {}
        profile = os.getenv("SENSEMAP_SENSOR_PROFILE", "auto").lower()

        def light_reader() -> Reader:
            if profile in ("auto", "grove"):
                try:
                    return GroveLightReader(int(os.getenv("GROVE_LIGHT_CHANNEL", "0")))
                except Exception:
                    if profile == "grove":
                        raise
            return BH1750Reader()

        def sound_reader() -> Reader:
            if profile in ("auto", "grove"):
                try:
                    return GroveSoundReader(int(os.getenv("GROVE_SOUND_CHANNEL", "2")))
                except Exception:
                    if profile == "grove":
                        raise
            return MCP3008SoundReader(int(os.getenv("MCP3008_CHANNEL", "0")))

        def temperature_reader() -> Reader:
            mode = os.getenv("SENSEMAP_TEMPERATURE_MODE", "auto").lower()
            if mode in ("simulated", "disabled", "off"):
                raise RuntimeError("temperature sensor disabled; using simulator")
            return DHT22Reader(os.getenv("DHT_PIN", "D4"))

        factories = {
            "light": light_reader,
            "temperature": temperature_reader,
            "sound": sound_reader,
        }
        fallbacks = {
            "light": lambda: SimulatedReader("light", 430, 170, 24, "lux"),
            "temperature": lambda: SimulatedReader("temperature", 21.5, 2.2, 90),
            "sound": lambda: SimulatedReader("sound", 38, 22, 18),
        }

        for name in ("light", "temperature", "sound"):
            if simulate:
                self.readers[name] = fallbacks[name]()
                continue
            try:
                self.readers[name] = factories[name]()
                print(
                    f"[sensemap] {name}: "
                    f"{type(self.readers[name]).__name__} ready"
                )
            except Exception as exc:
                print(f"[sensemap] {name}: using simulator ({exc})")
                self.readers[name] = fallbacks[name]()

        self.windows = {name: deque(maxlen=5) for name in self.readers}

    def read(self) -> Reading:
        values: dict[str, float] = {}
        successful_live = 0
        for name, reader in self.readers.items():
            try:
                raw = reader.read()
                self.windows[name].append(raw)
                values[name] = statistics.median(self.windows[name])
                successful_live += int(reader.is_live)
            except Exception as exc:
                print(f"[sensemap] {name} read failed: {exc}")
                values[name] = statistics.median(self.windows[name]) if self.windows[name] else 0.0

        live_count = sum(int(reader.is_live) for reader in self.readers.values())
        source = "live" if successful_live == len(self.readers) else "estimated"
        if live_count == 0:
            source = "simulated"

        return Reading(
            timestamp=utc_now(),
            device_id=self.device_id,
            room_id=self.room_id,
            lux=round(values["light"], 1),
            light_unit=str(getattr(self.readers["light"], "unit", "lux")),
            sound_level=round(values["sound"], 1),
            temperature_c=round(values["temperature"], 1),
            people_estimate=self.people,
            source=source,
            quality=round(successful_live / len(self.readers), 2),
        )


def post_reading(endpoint: str, token: str, reading: Reading) -> bool:
    body = json.dumps(asdict(reading)).encode("utf-8")
    request = urllib.request.Request(
        endpoint,
        data=body,
        headers={"Content-Type": "application/json", "x-device-token": token},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            return 200 <= response.status < 300
    except (urllib.error.URLError, TimeoutError) as exc:
        print(f"[sensemap] upload failed: {exc}")
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description="SenseMap sensor uploader")
    parser.add_argument("--simulate", action="store_true", help="Use simulated sensors")
    parser.add_argument("--once", action="store_true", help="Print/upload once and exit")
    parser.add_argument("--interval", type=float, default=3.0)
    parser.add_argument("--endpoint", default=os.getenv("SENSEMAP_ENDPOINT", ""))
    args = parser.parse_args()

    node = SensorNode(simulate=args.simulate)
    token = os.getenv("SENSEMAP_DEVICE_TOKEN", "sensemap-demo-token")
    running = True

    def stop(*_: object) -> None:
        nonlocal running
        running = False

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)

    while running:
        reading = node.read()
        print(json.dumps(asdict(reading)))
        if args.endpoint:
            uploaded = post_reading(args.endpoint, token, reading)
            print(f"[sensemap] uploaded={uploaded}")
        if args.once:
            break
        time.sleep(max(1.0, args.interval))


if __name__ == "__main__":
    main()
