"use client";

import dynamic from "next/dynamic";
import type { MutableRefObject } from "react";
import type { ForceGraphMethods as Methods2D, ForceGraphProps as Props2D } from "react-force-graph-2d";
import type { ForceGraphMethods as Methods3D, ForceGraphProps as Props3D } from "react-force-graph-3d";

/**
 * next/dynamic wrappers are plain function components, so a `ref` on them is dropped with a
 * warning and the graph methods (zoom, zoomToFit) never attach. These forward the ref through a
 * `graphRef` prop to the real, lazily loaded graph component.
 */
export const ForceGraph2D = dynamic<Props2D & { graphRef?: MutableRefObject<Methods2D | undefined> }>(
  async () => {
    const { default: Graph } = await import("react-force-graph-2d");
    return function ForceGraph2DWithRef({ graphRef, ...props }) {
      return <Graph ref={graphRef} {...props} />;
    };
  },
  { ssr: false }
);

export const ForceGraph3D = dynamic<Props3D & { graphRef?: MutableRefObject<Methods3D | undefined> }>(
  async () => {
    const { default: Graph } = await import("react-force-graph-3d");
    return function ForceGraph3DWithRef({ graphRef, ...props }) {
      return <Graph ref={graphRef} {...props} />;
    };
  },
  { ssr: false }
);
