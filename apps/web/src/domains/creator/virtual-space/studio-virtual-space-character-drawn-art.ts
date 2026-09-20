import type { StudioCharacterAtlasClip, StudioCharacterPoseSheet } from "./studio-virtual-space-character-skins";

// Exact imagegen PNG frames; origins and uniform scale never alter source pixels.
export const PINK_DRAWN_WALKS = {
  "walk-right": {
    "textureUrl": "/assets/virtual-studio/drawn-characters-v1/player-pink-walk-right.png",
    "frameWidth": 561,
    "frameHeight": 701,
    "frames": [
      {
        "originX": 0.535651,
        "originY": 0.951498,
        "displayHeightRatio": 0.967496
      },
      {
        "originX": 0.420677,
        "originY": 0.952924,
        "displayHeightRatio": 0.965931
      },
      {
        "originX": 0.531194,
        "originY": 0.907275,
        "displayHeightRatio": 0.97381
      },
      {
        "originX": 0.418895,
        "originY": 0.907275,
        "displayHeightRatio": 0.97381
      }
    ],
    "start": 0,
    "end": 3,
    "frameRate": 7,
    "repeat": -1,
    "distancePerCycle": 84,
    "technique": "drawn"
  },
  "walk-up": {
    "textureUrl": "/assets/virtual-studio/drawn-characters-v1/player-pink-walk-up.png",
    "frameWidth": 561,
    "frameHeight": 701,
    "frames": [
      {
        "originX": 0.534759,
        "originY": 0.942939,
        "displayHeightRatio": 0.991604
      },
      {
        "originX": 0.464349,
        "originY": 0.928673,
        "displayHeightRatio": 1.01006
      },
      {
        "originX": 0.534759,
        "originY": 0.917261,
        "displayHeightRatio": 0.989959
      },
      {
        "originX": 0.468806,
        "originY": 0.914408,
        "displayHeightRatio": 0.994909
      }
    ],
    "start": 0,
    "end": 3,
    "frameRate": 7,
    "repeat": -1,
    "distancePerCycle": 84,
    "technique": "drawn"
  },
  "walk-down": {
    "textureUrl": "/assets/virtual-studio/drawn-characters-v1/player-pink-walk-down.png",
    "frameWidth": 561,
    "frameHeight": 701,
    "frames": [
      {
        "originX": 0.564171,
        "originY": 0.965763,
        "displayHeightRatio": 0.952066
      },
      {
        "originX": 0.432264,
        "originY": 0.952924,
        "displayHeightRatio": 0.967496
      },
      {
        "originX": 0.566845,
        "originY": 0.92582,
        "displayHeightRatio": 0.952066
      },
      {
        "originX": 0.427807,
        "originY": 0.914408,
        "displayHeightRatio": 0.962815
      }
    ],
    "start": 0,
    "end": 3,
    "frameRate": 7,
    "repeat": -1,
    "distancePerCycle": 84,
    "technique": "drawn"
  },
  "walk-left": {
    "textureUrl": "/assets/virtual-studio/drawn-characters-v1/player-pink-walk-left.png",
    "frameWidth": 561,
    "frameHeight": 701,
    "frames": [
      {
        "originX": 0.552585,
        "originY": 0.950071,
        "displayHeightRatio": 0.949039
      },
      {
        "originX": 0.445633,
        "originY": 0.952924,
        "displayHeightRatio": 0.946031
      },
      {
        "originX": 0.551693,
        "originY": 0.908702,
        "displayHeightRatio": 0.978599
      },
      {
        "originX": 0.446524,
        "originY": 0.924394,
        "displayHeightRatio": 0.961265
      }
    ],
    "start": 0,
    "end": 3,
    "frameRate": 7,
    "repeat": -1,
    "distancePerCycle": 84,
    "technique": "drawn"
  }
} satisfies Record<string, StudioCharacterAtlasClip>;

export const PINK_DRAWN_POSES = {
  "wave": {
    "textureUrl": "/assets/virtual-studio/drawn-characters-v1/player-pink-wave.png",
    "frameWidth": 561,
    "frameHeight": 701,
    "frames": [
      {
        "originX": 0.540998,
        "originY": 0.917261,
        "displayHeightRatio": 0.981818
      },
      {
        "originX": 0.455437,
        "originY": 0.918688,
        "displayHeightRatio": 0.986686
      },
      {
        "originX": 0.525847,
        "originY": 0.914408,
        "displayHeightRatio": 0.959719
      },
      {
        "originX": 0.533868,
        "originY": 0.910128,
        "displayHeightRatio": 0.96437
      }
    ],
    "directionFrames": {
      "down": 0,
      "right": 1,
      "left": 2,
      "up": 3
    }
  },
  "sit": {
    "textureUrl": "/assets/virtual-studio/drawn-characters-v1/player-pink-sit.png",
    "frameWidth": 561,
    "frameHeight": 701,
    "frames": [
      {
        "originX": 0.560606,
        "originY": 0.972896,
        "displayHeightRatio": 0.748018,
        "seatOriginY": 0.64194
      },
      {
        "originX": 0.376114,
        "originY": 0.974322,
        "displayHeightRatio": 0.748018,
        "seatOriginY": 0.636234
      },
      {
        "originX": 0.578431,
        "originY": 0.942939,
        "displayHeightRatio": 0.751455,
        "seatOriginY": 0.634807
      },
      {
        "originX": 0.462567,
        "originY": 0.942939,
        "displayHeightRatio": 0.752607,
        "seatOriginY": 0.670471
      }
    ],
    "directionFrames": {
      "down": 0,
      "right": 1,
      "left": 2,
      "up": 3
    }
  }
} satisfies Record<string, StudioCharacterPoseSheet>;

export const SILVER_DRAWN_WALKS = {
  "walk-right": {
    "textureUrl": "/assets/virtual-studio/drawn-characters-v1/player-silver-walk-right.png",
    "frameWidth": 561,
    "frameHeight": 701,
    "frames": [
      {
        "originX": 0.52139,
        "originY": 0.960057,
        "displayHeightRatio": 0.918377
      },
      {
        "originX": 0.418895,
        "originY": 0.960057,
        "displayHeightRatio": 0.918377
      },
      {
        "originX": 0.523173,
        "originY": 0.940086,
        "displayHeightRatio": 0.929821
      },
      {
        "originX": 0.421569,
        "originY": 0.948645,
        "displayHeightRatio": 0.921212
      }
    ],
    "start": 0,
    "end": 3,
    "frameRate": 7,
    "repeat": -1,
    "distancePerCycle": 84,
    "technique": "drawn"
  },
  "walk-up": {
    "textureUrl": "/assets/virtual-studio/drawn-characters-v1/player-silver-walk-up.png",
    "frameWidth": 561,
    "frameHeight": 701,
    "frames": [
      {
        "originX": 0.531194,
        "originY": 0.927247,
        "displayHeightRatio": 0.989959
      },
      {
        "originX": 0.459002,
        "originY": 0.9301,
        "displayHeightRatio": 0.986686
      },
      {
        "originX": 0.531194,
        "originY": 0.905849,
        "displayHeightRatio": 0.981818
      },
      {
        "originX": 0.459893,
        "originY": 0.901569,
        "displayHeightRatio": 0.986686
      }
    ],
    "start": 0,
    "end": 3,
    "frameRate": 7,
    "repeat": -1,
    "distancePerCycle": 84,
    "technique": "drawn"
  },
  "walk-down": {
    "textureUrl": "/assets/virtual-studio/drawn-characters-v1/player-silver-walk-down.png",
    "frameWidth": 561,
    "frameHeight": 701,
    "frames": [
      {
        "originX": 0.573084,
        "originY": 0.947218,
        "displayHeightRatio": 0.956643
      },
      {
        "originX": 0.428699,
        "originY": 0.957204,
        "displayHeightRatio": 0.944534
      },
      {
        "originX": 0.576649,
        "originY": 0.908702,
        "displayHeightRatio": 0.958179
      },
      {
        "originX": 0.426916,
        "originY": 0.918688,
        "displayHeightRatio": 0.947532
      }
    ],
    "start": 0,
    "end": 3,
    "frameRate": 7,
    "repeat": -1,
    "distancePerCycle": 84,
    "technique": "drawn"
  },
  "walk-left": {
    "textureUrl": "/assets/virtual-studio/drawn-characters-v1/player-silver-walk-left.png",
    "frameWidth": 561,
    "frameHeight": 701,
    "frames": [
      {
        "originX": 0.539216,
        "originY": 0.965763,
        "displayHeightRatio": 0.938593
      },
      {
        "originX": 0.462567,
        "originY": 0.971469,
        "displayHeightRatio": 0.932727
      },
      {
        "originX": 0.541889,
        "originY": 0.917261,
        "displayHeightRatio": 0.956643
      },
      {
        "originX": 0.467023,
        "originY": 0.921541,
        "displayHeightRatio": 0.95055
      }
    ],
    "start": 0,
    "end": 3,
    "frameRate": 7,
    "repeat": -1,
    "distancePerCycle": 84,
    "technique": "drawn"
  }
} satisfies Record<string, StudioCharacterAtlasClip>;

export const SILVER_DRAWN_POSES = {
  "wave": {
    "textureUrl": "/assets/virtual-studio/drawn-characters-v1/player-silver-wave.png",
    "frameWidth": 561,
    "frameHeight": 701,
    "frames": [
      {
        "originX": 0.55615,
        "originY": 0.861626,
        "displayHeightRatio": 1.16819
      },
      {
        "originX": 0.444742,
        "originY": 0.865906,
        "displayHeightRatio": 1.170481
      },
      {
        "originX": 0.568627,
        "originY": 0.868759,
        "displayHeightRatio": 1.145768
      },
      {
        "originX": 0.480392,
        "originY": 0.867332,
        "displayHeightRatio": 1.145768
      }
    ],
    "directionFrames": {
      "down": 0,
      "right": 1,
      "left": 2,
      "up": 3
    }
  },
  "sit": {
    "textureUrl": "/assets/virtual-studio/drawn-characters-v1/player-silver-sit.png",
    "frameWidth": 561,
    "frameHeight": 701,
    "frames": [
      {
        "originX": 0.580214,
        "originY": 0.977175,
        "displayHeightRatio": 0.730208,
        "seatOriginY": 0.703281
      },
      {
        "originX": 0.437611,
        "originY": 0.977175,
        "displayHeightRatio": 0.734581,
        "seatOriginY": 0.757489
      },
      {
        "originX": 0.57754,
        "originY": 0.951498,
        "displayHeightRatio": 0.74236,
        "seatOriginY": 0.741797
      },
      {
        "originX": 0.487522,
        "originY": 0.945792,
        "displayHeightRatio": 0.741239,
        "seatOriginY": 0.726106
      }
    ],
    "directionFrames": {
      "down": 0,
      "right": 1,
      "left": 2,
      "up": 3
    }
  }
} satisfies Record<string, StudioCharacterPoseSheet>;

export const SILVER_DRAWN_REVIEWS = {
  "down": {
    "textureUrl": "/assets/virtual-studio/drawn-characters-v1/player-silver-review-down.png",
    "frameWidth": 561,
    "frameHeight": 701,
    "frames": [
      {
        "originX": 0.558824,
        "originY": 0.937233,
        "displayHeightRatio": 0.935235
      },
      {
        "originX": 0.44385,
        "originY": 0.937233,
        "displayHeightRatio": 0.935235
      },
      {
        "originX": 0.567736,
        "originY": 0.920114,
        "displayHeightRatio": 0.935235
      },
      {
        "originX": 0.44385,
        "originY": 0.920114,
        "displayHeightRatio": 0.935235
      }
    ],
    "start": 0,
    "end": 3,
    "frameRate": 1.6666666666666667,
    "repeat": -1,
    "technique": "drawn"
  },
  "right": {
    "textureUrl": "/assets/virtual-studio/drawn-characters-v1/player-silver-review-right.png",
    "frameWidth": 561,
    "frameHeight": 701,
    "frames": [
      {
        "originX": 0.553476,
        "originY": 0.950071,
        "displayHeightRatio": 0.959626
      },
      {
        "originX": 0.467914,
        "originY": 0.951498,
        "displayHeightRatio": 0.959626
      },
      {
        "originX": 0.540998,
        "originY": 0.932953,
        "displayHeightRatio": 0.959626
      },
      {
        "originX": 0.477718,
        "originY": 0.932953,
        "displayHeightRatio": 0.959626
      }
    ],
    "start": 0,
    "end": 3,
    "frameRate": 1.6666666666666667,
    "repeat": -1,
    "technique": "drawn"
  },
  "left": {
    "textureUrl": "/assets/virtual-studio/drawn-characters-v1/player-silver-review-left.png",
    "frameWidth": 561,
    "frameHeight": 701,
    "frames": [
      {
        "originX": 0.527629,
        "originY": 0.955777,
        "displayHeightRatio": 0.951099
      },
      {
        "originX": 0.459893,
        "originY": 0.955777,
        "displayHeightRatio": 0.951099
      },
      {
        "originX": 0.532977,
        "originY": 0.942939,
        "displayHeightRatio": 0.951099
      },
      {
        "originX": 0.458111,
        "originY": 0.944365,
        "displayHeightRatio": 0.951099
      }
    ],
    "start": 0,
    "end": 3,
    "frameRate": 1.6666666666666667,
    "repeat": -1,
    "technique": "drawn"
  },
  "up": {
    "textureUrl": "/assets/virtual-studio/drawn-characters-v1/player-silver-review-up.png",
    "frameWidth": 561,
    "frameHeight": 701,
    "frames": [
      {
        "originX": 0.540107,
        "originY": 0.934379,
        "displayHeightRatio": 0.998695
      },
      {
        "originX": 0.473262,
        "originY": 0.934379,
        "displayHeightRatio": 0.998695
      },
      {
        "originX": 0.545455,
        "originY": 0.904422,
        "displayHeightRatio": 0.998695
      },
      {
        "originX": 0.475045,
        "originY": 0.904422,
        "displayHeightRatio": 0.998695
      }
    ],
    "start": 0,
    "end": 3,
    "frameRate": 1.6666666666666667,
    "repeat": -1,
    "technique": "drawn"
  }
} satisfies Record<string, StudioCharacterAtlasClip>;

export const DARK_DRAWN_WALKS = {
  "walk-right": {
    "textureUrl": "/assets/virtual-studio/drawn-characters-v1/player-dark-walk-right.png",
    "frameWidth": 561,
    "frameHeight": 701,
    "frames": [
      {
        "originX": 0.575758,
        "originY": 0.965763,
        "displayHeightRatio": 0.914158
      },
      {
        "originX": 0.470588,
        "originY": 0.96719,
        "displayHeightRatio": 0.91276
      },
      {
        "originX": 0.57754,
        "originY": 0.941512,
        "displayHeightRatio": 0.932727
      },
      {
        "originX": 0.470588,
        "originY": 0.951498,
        "displayHeightRatio": 0.922636
      }
    ],
    "start": 0,
    "end": 3,
    "frameRate": 7,
    "repeat": -1,
    "distancePerCycle": 84,
    "technique": "drawn"
  },
  "walk-up": {
    "textureUrl": "/assets/virtual-studio/drawn-characters-v1/player-dark-walk-up.png",
    "frameWidth": 561,
    "frameHeight": 701,
    "frames": [
      {
        "originX": 0.555258,
        "originY": 0.927247,
        "displayHeightRatio": 0.981818
      },
      {
        "originX": 0.450089,
        "originY": 0.940086,
        "displayHeightRatio": 0.969067
      },
      {
        "originX": 0.555258,
        "originY": 0.910128,
        "displayHeightRatio": 0.97381
      },
      {
        "originX": 0.449198,
        "originY": 0.9301,
        "displayHeightRatio": 0.952066
      }
    ],
    "start": 0,
    "end": 3,
    "frameRate": 7,
    "repeat": -1,
    "distancePerCycle": 84,
    "technique": "drawn"
  },
  "walk-down": {
    "textureUrl": "/assets/virtual-studio/drawn-characters-v1/player-dark-walk-down.png",
    "frameWidth": 561,
    "frameHeight": 701,
    "frames": [
      {
        "originX": 0.567736,
        "originY": 0.96719,
        "displayHeightRatio": 0.90037
      },
      {
        "originX": 0.448307,
        "originY": 0.975749,
        "displayHeightRatio": 0.893631
      },
      {
        "originX": 0.57041,
        "originY": 0.947218,
        "displayHeightRatio": 0.91276
      },
      {
        "originX": 0.459893,
        "originY": 0.960057,
        "displayHeightRatio": 0.90173
      }
    ],
    "start": 0,
    "end": 3,
    "frameRate": 7,
    "repeat": -1,
    "distancePerCycle": 84,
    "technique": "drawn"
  },
  "walk-left": {
    "textureUrl": "/assets/virtual-studio/drawn-characters-v1/player-dark-walk-left.png",
    "frameWidth": 561,
    "frameHeight": 701,
    "frames": [
      {
        "originX": 0.518717,
        "originY": 0.964337,
        "displayHeightRatio": 0.928375
      },
      {
        "originX": 0.440285,
        "originY": 0.964337,
        "displayHeightRatio": 0.931272
      },
      {
        "originX": 0.525847,
        "originY": 0.914408,
        "displayHeightRatio": 0.956643
      },
      {
        "originX": 0.453654,
        "originY": 0.918688,
        "displayHeightRatio": 0.955112
      }
    ],
    "start": 0,
    "end": 3,
    "frameRate": 7,
    "repeat": -1,
    "distancePerCycle": 84,
    "technique": "drawn"
  }
} satisfies Record<string, StudioCharacterAtlasClip>;

export const DARK_DRAWN_POSES = {
  "sit": {
    "textureUrl": "/assets/virtual-studio/drawn-characters-v1/player-dark-sit.png",
    "frameWidth": 561,
    "frameHeight": 701,
    "frames": [
      {
        "originX": 0.592692,
        "originY": 0.972896,
        "displayHeightRatio": 0.732388,
        "seatOriginY": 0.704708
      },
      {
        "originX": 0.451872,
        "originY": 0.974322,
        "displayHeightRatio": 0.734581,
        "seatOriginY": 0.74893
      },
      {
        "originX": 0.573975,
        "originY": 0.954351,
        "displayHeightRatio": 0.737895,
        "seatOriginY": 0.736091
      },
      {
        "originX": 0.474153,
        "originY": 0.950071,
        "displayHeightRatio": 0.74236,
        "seatOriginY": 0.724679
      }
    ],
    "directionFrames": {
      "down": 0,
      "right": 1,
      "left": 2,
      "up": 3
    }
  },
  "wave": {
    "textureUrl": "/assets/virtual-studio/drawn-characters-v1/player-dark-wave.png",
    "frameWidth": 561,
    "frameHeight": 701,
    "frames": [
      {
        "originX": 0.562389,
        "originY": 0.945792,
        "displayHeightRatio": 0.98832
      },
      {
        "originX": 0.445633,
        "originY": 0.957204,
        "displayHeightRatio": 0.989959
      },
      {
        "originX": 0.605169,
        "originY": 0.894437,
        "displayHeightRatio": 0.999908
      },
      {
        "originX": 0.458111,
        "originY": 0.895863,
        "displayHeightRatio": 0.98832
      }
    ],
    "directionFrames": {
      "down": 0,
      "right": 1,
      "left": 2,
      "up": 3
    }
  }
} satisfies Record<string, StudioCharacterPoseSheet>;

export const PURPLE_DRAWN_WALKS = {
  "walk-down": {
    "textureUrl": "/assets/virtual-studio/drawn-characters-v1/player-purple-walk-down.png",
    "frameWidth": 561,
    "frameHeight": 701,
    "frames": [
      {
        "originX": 0.57754,
        "originY": 0.960057,
        "displayHeightRatio": 0.938593
      },
      {
        "originX": 0.397504,
        "originY": 0.961484,
        "displayHeightRatio": 0.93712
      },
      {
        "originX": 0.582888,
        "originY": 0.934379,
        "displayHeightRatio": 0.925497
      },
      {
        "originX": 0.404635,
        "originY": 0.934379,
        "displayHeightRatio": 0.929821
      }
    ],
    "start": 0,
    "end": 3,
    "frameRate": 7,
    "repeat": -1,
    "distancePerCycle": 84,
    "technique": "drawn"
  },
  "walk-up": {
    "textureUrl": "/assets/virtual-studio/drawn-characters-v1/player-purple-walk-up.png",
    "frameWidth": 561,
    "frameHeight": 701,
    "frames": [
      {
        "originX": 0.524955,
        "originY": 0.941512,
        "displayHeightRatio": 0.980206
      },
      {
        "originX": 0.469697,
        "originY": 0.944365,
        "displayHeightRatio": 0.980206
      },
      {
        "originX": 0.527629,
        "originY": 0.920114,
        "displayHeightRatio": 0.976997
      },
      {
        "originX": 0.466132,
        "originY": 0.922967,
        "displayHeightRatio": 0.97381
      }
    ],
    "start": 0,
    "end": 3,
    "frameRate": 7,
    "repeat": -1,
    "distancePerCycle": 84,
    "technique": "drawn"
  },
  "walk-right": {
    "textureUrl": "/assets/virtual-studio/drawn-characters-v1/player-purple-walk-right.png",
    "frameWidth": 561,
    "frameHeight": 701,
    "frames": [
      {
        "originX": 0.535651,
        "originY": 0.974322,
        "displayHeightRatio": 0.926934
      },
      {
        "originX": 0.43672,
        "originY": 0.980029,
        "displayHeightRatio": 0.921212
      },
      {
        "originX": 0.539216,
        "originY": 0.924394,
        "displayHeightRatio": 0.946031
      },
      {
        "originX": 0.437611,
        "originY": 0.928673,
        "displayHeightRatio": 0.940071
      }
    ],
    "start": 0,
    "end": 3,
    "frameRate": 7,
    "repeat": -1,
    "distancePerCycle": 84,
    "technique": "drawn"
  },
  "walk-left": {
    "textureUrl": "/assets/virtual-studio/drawn-characters-v1/player-purple-walk-left.png",
    "frameWidth": 561,
    "frameHeight": 701,
    "frames": [
      {
        "originX": 0.558824,
        "originY": 0.96291,
        "displayHeightRatio": 0.949039
      },
      {
        "originX": 0.481283,
        "originY": 0.968616,
        "displayHeightRatio": 0.943042
      },
      {
        "originX": 0.552585,
        "originY": 0.922967,
        "displayHeightRatio": 0.956643
      },
      {
        "originX": 0.483066,
        "originY": 0.934379,
        "displayHeightRatio": 0.944534
      }
    ],
    "start": 0,
    "end": 3,
    "frameRate": 7,
    "repeat": -1,
    "distancePerCycle": 84,
    "technique": "drawn"
  }
} satisfies Record<string, StudioCharacterAtlasClip>;

export const PURPLE_DRAWN_POSES = {
  "sit": {
    "textureUrl": "/assets/virtual-studio/drawn-characters-v1/player-purple-sit.png",
    "frameWidth": 561,
    "frameHeight": 701,
    "frames": [
      {
        "originX": 0.555258,
        "originY": 0.980029,
        "displayHeightRatio": 0.745745,
        "seatOriginY": 0.699001
      },
      {
        "originX": 0.369875,
        "originY": 0.978602,
        "displayHeightRatio": 0.74916,
        "seatOriginY": 0.737518
      },
      {
        "originX": 0.596257,
        "originY": 0.954351,
        "displayHeightRatio": 0.745745,
        "seatOriginY": 0.701854
      },
      {
        "originX": 0.43672,
        "originY": 0.944365,
        "displayHeightRatio": 0.752607,
        "seatOriginY": 0.713267
      }
    ],
    "directionFrames": {
      "down": 0,
      "right": 1,
      "left": 2,
      "up": 3
    }
  },
  "wave": {
    "textureUrl": "/assets/virtual-studio/drawn-characters-v1/player-purple-wave.png",
    "frameWidth": 561,
    "frameHeight": 701,
    "frames": [
      {
        "originX": 0.531194,
        "originY": 0.944365,
        "displayHeightRatio": 0.941554
      },
      {
        "originX": 0.454545,
        "originY": 0.948645,
        "displayHeightRatio": 0.940071
      },
      {
        "originX": 0.545455,
        "originY": 0.9301,
        "displayHeightRatio": 0.928375
      },
      {
        "originX": 0.516934,
        "originY": 0.937233,
        "displayHeightRatio": 0.919792
      }
    ],
    "directionFrames": {
      "down": 0,
      "right": 1,
      "left": 2,
      "up": 3
    }
  }
} satisfies Record<string, StudioCharacterPoseSheet>;
