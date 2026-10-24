/**
 * The room's CD player as the app sees it (docs/RADIO.md › Contract with the room). The player was built
 * beside the room's half against a structural copy; now it names the room's own `RadioDeck` family, so the
 * type checker proves that `room.radio` is what the player relies on. Types only: no room code reaches the
 * player's chunk.
 */
export type {
  DeckState,
  DiscAnchor,
  DiscArt,
  FramingInsets,
  LcdReadout,
  RadioCue,
  RadioCueEvent,
  RadioDeck,
  RadioIntent,
  RadioKey,
  RadioLayout,
  RoomView,
  ScreenRect,
  Transport,
} from '@/room';
