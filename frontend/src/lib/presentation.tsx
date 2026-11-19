import {
  AirVent, AlarmClock, Armchair, BedDouble, Bath, CalendarClock, DoorOpen, Gamepad2, HandHeart,
  KeyRound, Lightbulb, Luggage, MoonStar, NotebookPen, Palette, Puzzle, Soup, Sparkles, Trash2,
  type LucideIcon,
} from "lucide-react";
import type { SpaceType } from "./examples";

const frictionIcons: Record<string, LucideIcon> = {
  night_sound: MoonStar, alarms: AlarmClock, lights: Lightbulb, visitors: DoorOpen, borrowing: HandHeart,
  trash: Trash2, cleaning: Sparkles, bathroom: Bath, food: Soup, shared_devices: Gamepad2,
  air_conditioning: AirVent, shared_desks: Armchair, time_slots: CalendarClock, reset_room: Puzzle, departure: KeyRound,
};

const spaceIcons: Record<SpaceType, LucideIcon> = { shared_home: BedDouble, short_stay: Luggage, club_room: Palette };

export function FrictionIcon({ frictionKey, size = 18 }: { frictionKey: string; size?: number }) {
  const Icon = frictionIcons[frictionKey] ?? NotebookPen;
  return <span className="friction-emoji" data-friction-icon={frictionKey} aria-hidden="true"><Icon size={size} strokeWidth={1.8} /></span>;
}

export function SpaceIcon({ space, size = 22 }: { space: SpaceType; size?: number }) {
  const Icon = spaceIcons[space];
  return <span className="space-icon" aria-hidden="true"><Icon size={size} strokeWidth={1.7} /></span>;
}
