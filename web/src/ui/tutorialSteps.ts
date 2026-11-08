/** One thing to learn: the keys to press, what it does, and one line on how. */
export interface TutorialStep {
  keys: string[];
  title: string;
  text: string;
}

/** In the order a new player needs them; every key main.ts binds is listed here. */
export const TUTORIAL_STEPS: TutorialStep[] = [
  { keys: ['Mouse'], title: 'Look around', text: 'Click the world to take control, then move the mouse. Esc gives the mouse back.' },
  { keys: ['W', 'A', 'S', 'D'], title: 'Move', text: 'Walk forward, left, back and right.' },
  { keys: ['Shift'], title: 'Run', text: 'Hold Shift while you move. In water, it dives.' },
  { keys: ['Space'], title: 'Jump and swim', text: 'Tap to jump. In water, hold to swim up.' },
  { keys: ['F'], title: 'Rocket booster', text: 'Hold F to fly, from the ground or mid-jump. The fuel refills when you land.' },
  { keys: ['E'], title: 'Use things', text: 'Look at a door, lamp, fire, bell or bench, then press E. The prompt on screen says what it will do.' },
  { keys: ['E'], title: 'Drive a car', text: 'A car is parked near where you start. Press E beside it to get in, and E again to get out.' },
  { keys: ['W', 'A', 'S', 'D'], title: 'Steer the car', text: 'W and S drive, A and D steer, Space brakes and Shift boosts.' },
  { keys: ['T'], title: 'Talk to the world', text: 'Type a change like “make it night” or “put a lighthouse there”. Enter applies it, Esc cancels.' },
  { keys: ['U'], title: 'Undo a change', text: 'Takes back the last change you made to the world.' },
  { keys: ['V'], title: 'Switch camera', text: 'Swap between first-person and third-person view.' },
  { keys: ['B'], title: 'Change character', text: 'Play as the next character.' },
  { keys: ['C'], title: 'See the world checks', text: 'Opens the list of checks on this world. Press C again to close it.' },
  { keys: ['R'], title: 'Choose the resolution', text: 'Auto lowers it when the frame rate drops. Pick Low to Ultra to keep it fixed.' },
  { keys: ['N'], title: 'Make a new world', text: 'Go back to the start screen and describe another one.' },
  { keys: ['H'], title: 'See this again', text: 'H opens this tutorial any time. Have fun exploring.' },
];
