export type RecipeComponentInput = {
  id: string;
  componentName: string;
  piecesPerGarment: number;
};

export type ExpectedComponent = {
  componentId: string;
  componentName: string;
  expectedQty: number;
};

/** expectedQty = targetQty × piecesPerGarment for each component. */
export function computeExpectedComponents(
  targetQty: number,
  components: RecipeComponentInput[],
): ExpectedComponent[] {
  return components.map((component) => ({
    componentId: component.id,
    componentName: component.componentName,
    expectedQty: targetQty * component.piecesPerGarment,
  }));
}

/** Expected fabric yards = targetQty × stdFabricYards. */
export function computeExpectedFabric(
  targetQty: number,
  stdFabricYards: number,
): number {
  return targetQty * stdFabricYards;
}
