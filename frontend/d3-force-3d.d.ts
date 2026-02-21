declare module "d3-force-3d" {
  export function forceRadial(
    radius: number | ((node: any, index: number, nodes: any[]) => number),
    x?: number,
    y?: number,
  ): any;

  export function forceCollide(
    radius?: number | ((node: any, index: number, nodes: any[]) => number),
  ): any;
}
