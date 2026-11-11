/*
 * Level maps. Every level is a list of zones (the main area plus any bonus rooms), and every zone is
 * a list of segments placed side by side. A segment is 15 rows of text; each character is one 16x16
 * tile. Rows 0-1 sit behind the score display and rows 13-14 are normally the ground.
 *
 * Terrain
 *   #  ground                 X  hard block              %  wall brick (cannot be broken)
 *   B  brick                  ?  coin block              M  power-up block (mushroom or flower)
 *   S  brick hiding a star    C  brick hiding 10 coins   L  hidden block with a 1-up
 *   H  hidden coin block      o  coin
 *   P  pipe (top-left corner; the body grows down to the ground)
 *   V  pipe with a piranha plant
 *   >  sideways pipe mouth (two tiles tall, top half here; the body grows right to the wall)
 *   T  treetop platform (the trunk grows down by itself)
 *   =  bridge                 ~  lava                    A  axe
 *
 * Things
 *   @  player start           c  checkpoint
 *   g  goomba                 k  green koopa             r  red koopa (turns at ledges)
 *   -  lift, side to side     |  lift, up and down       _  lift that drops when stood on
 *   u  lift looping upward    d  lift looping downward   (lifts are three tiles wide)
 *   f  fire bar               j  lava bubble             Z  boss                 t  toad
 *   F  flagpole base          ^  castle (bottom-left corner)
 *   1-9  named markers used by the level's `warps` list
 *
 * Warps: { from, enter, to, exit }. For enter 'down' put the `from` marker above the left half of a
 * pipe top; for enter 'right' put it left of the lower half of a sideways pipe mouth. For exit 'up'
 * put the `to` marker above the left half of a pipe top; for exit 'fall' put it anywhere in the air.
 */
(function (SM) {
  'use strict';

  const WORLD_1_1 = {
    name: '1-1',
    time: 400,
    warps: [
      { from: '1', enter: 'down', to: '2', exit: 'fall' },
      { from: '3', enter: 'right', to: '4', exit: 'up' },
    ],
    zones: [
      {
        theme: 'overworld',
        map: [
          [
            '                        ',
            '                        ',
            '                        ',
            '                        ',
            '                        ',
            '                     ?  ',
            '                        ',
            '                        ',
            '                        ',
            '              ?    BMB?B',
            '                        ',
            '                        ',
            '  @                   g ',
            '########################',
            '########################',
          ],
          [
            '                        ',
            '                        ',
            '                        ',
            '                        ',
            '                        ',
            '                        ',
            '                        ',
            '                        ',
            '                    1   ',
            '                    P   ',
            '            P           ',
            '    P                   ',
            '         g       g g    ',
            '########################',
            '########################',
          ],
          [
            '                        ',
            '                        ',
            '                        ',
            '                        ',
            '                    g g ',
            '                  BBBBBB',
            '                        ',
            '                        ',
            '    L                   ',
            '              BMB       ',
            '                        ',
            '                        ',
            '                        ',
            '##########  ############',
            '##########  ############',
          ],
          [
            '                        ',
            '                        ',
            '                        ',
            '                        ',
            '                        ',
            'BB    BBB?              ',
            '                        ',
            '                        ',
            '                        ',
            '         C     S        ',
            '                        ',
            '                        ',
            '                 k      ',
            '####   #################',
            '####   #################',
          ],
          [
            '                        ',
            '                        ',
            '                        ',
            '                        ',
            '                        ',
            '       M                ',
            '                        ',
            '                        ',
            '                        ',
            '    ?  ?  ?       BB    ',
            '                        ',
            '                        ',
            'c g g         g g       ',
            '########################',
            '########################',
          ],
          [
            '                        ',
            '                        ',
            '                        ',
            '                        ',
            '                        ',
            '  BBB    B??B           ',
            '                        ',
            '                        ',
            '                        ',
            '   B      BB   X  X     ',
            '              XX  XX    ',
            '             XXX  XXX   ',
            '      k     XXXX  XXXX  ',
            '########################',
            '########################',
          ],
          [
            '                        ',
            '                        ',
            '                        ',
            '                        ',
            '                        ',
            '                        ',
            '                        ',
            '                        ',
            '                        ',
            '    XX  X               ',
            '   XXX  XX         4    ',
            '  XXXX  XXX        P    ',
            ' XXXXX  XXXX            ',
            '######  ################',
            '######  ################',
          ],
          [
            '                        ',
            '                        ',
            '                        ',
            '                        ',
            '                        ',
            '                    XX  ',
            '                   XXX  ',
            '                  XXXX  ',
            '                 XXXXX  ',
            '  BB?B          XXXXXX  ',
            '               XXXXXXX  ',
            '              XXXXXXXX  ',
            '       g g   XXXXXXXXX  ',
            '########################',
            '########################',
          ],
          [
            '                        ',
            '                        ',
            '                        ',
            '                        ',
            '                        ',
            '                        ',
            '                        ',
            '                        ',
            '                        ',
            '                        ',
            '                        ',
            '                        ',
            '      F     ^           ',
            '########################',
            '########################',
          ],
        ],
      },
      {
        theme: 'underground',
        map: [
          [
            '%                       %',
            '%                       %',
            '% 2                     %',
            '%                       %',
            '%                     %%%',
            '%      ooooooooo      %%%',
            '%                     %%%',
            '%     ooooooooooo     %%%',
            '%                     %%%',
            '%     ooooooooooo     %%%',
            '%     BBBBBBBBBBB     %%%',
            '%                   > %%%',
            '%                  3  %%%',
            '#########################',
            '#########################',
          ],
        ],
      },
    ],
  };

  SM.LEVEL_DATA = [WORLD_1_1];
})((globalThis.SM = globalThis.SM || {}));
