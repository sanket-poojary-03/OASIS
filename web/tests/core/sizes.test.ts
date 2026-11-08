import { describe, expect, it } from 'vitest';
import { HEIGHT_RANGE, placeHeight } from '../../src/core/sizes';

describe('sizes: the AI may give a real height, the code keeps it in range', () => {
  it('without a height, the size table decides as before', () => {
    expect(placeHeight({ kind: 'prop', size: 'medium' })).toEqual({ height: 1.6 });
    expect(placeHeight({ kind: 'landmark', size: 'large' })).toEqual({ height: 24 });
  });

  it('a height inside its kind\'s range is used as given', () => {
    expect(placeHeight({ kind: 'prop', size: 'small', height: 3 })).toEqual({ height: 3 });
    expect(placeHeight({ kind: 'landmark', size: 'small', height: 60 })).toEqual({ height: 60 });
  });

  it('one outside it is clamped, never rejected, with a note saying so', () => {
    expect(placeHeight({ kind: 'prop', size: 'medium', height: 500 })).toEqual({ height: 6, note: 'made 6 m tall: a prop is at most 6 m' });
    expect(placeHeight({ kind: 'landmark', size: 'medium', height: 1 })).toEqual({ height: 5, note: 'made 5 m tall: a landmark is at least 5 m' });
  });

  it('a settlement\'s height comes from its layout, so a given one is ignored', () => {
    expect(placeHeight({ kind: 'settlement', size: 'medium', height: 30 })).toEqual({ height: 6 });
    expect(HEIGHT_RANGE.settlement).toBeUndefined();
  });
});
