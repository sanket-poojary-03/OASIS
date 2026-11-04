/**
 * Things the viewer's camera draws but the sea's reflection does not (Water.js draws the scene a second time, with a
 * camera on the default layer only). Shadows still include them: three.js tests shadow casters against the viewer's camera.
 */
export const NOT_REFLECTED = 1;
