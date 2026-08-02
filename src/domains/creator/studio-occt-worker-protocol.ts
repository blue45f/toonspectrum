import type {
  StudioOcctFail,
  StudioOcctSolidResult,
} from "./studio-occt-wasm-facade";

export type StudioOcctWorkerOperation =
  | {
      readonly kind: "box";
      readonly size: readonly [number, number, number];
    }
  | {
      readonly kind: "sphere";
      readonly radius: number;
    }
  | {
      readonly kind: "torus";
      readonly majorRadius: number;
      readonly minorRadius: number;
    }
  | {
      readonly kind: "revolve";
      readonly radius: number;
      readonly height: number;
    }
  | {
      readonly kind: "fillet-box";
      readonly size: readonly [number, number, number];
      readonly radius: number;
    }
  | {
      readonly kind: "loft";
      readonly levels: readonly {
        readonly dx: number;
        readonly dy: number;
        readonly z: number;
      }[];
    }
  | {
      readonly kind: "cut-boxes";
      readonly a: { readonly dx: number; readonly dy: number; readonly dz: number };
      readonly b: {
        readonly dx: number;
        readonly dy: number;
        readonly dz: number;
        readonly ox?: number;
        readonly oy?: number;
        readonly oz?: number;
      };
    };

export type StudioOcctWorkerRequest = {
  readonly id: number;
  readonly operation: StudioOcctWorkerOperation;
};

export type StudioOcctWorkerResponse = {
  readonly id: number;
  readonly result: StudioOcctSolidResult | StudioOcctFail;
};
