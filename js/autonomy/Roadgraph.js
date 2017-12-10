// Nodes are just poses (position + rotation)
// Edges are connect nodes together
//   * Represent single lanes
//   * Includes potentially many points describing its path
//   * Includes extra attributes like:
//     * Speed limit
//     * Road signs
//     * Lanes to change into

class Edge {
  constructor(from, to, points) {
    this.from = from;
    this.to = to;
    this.points = points;
  }
}

class Node {
  constructor(pos, rot) {
    this.pose = { pos, rot };
    this.edges = [];
  }

  addEdge(to, points) {
    const edge = new Edge(this, to, points);
    this.edges.push(edge);
    return edge;
  }
}

export class Roadgraph {
  constructor() {
    this.nodes = [];
  }

  addNode(pos, rot) {
    const node = new Node(pos, rot);
    this.nodes.push(node);
    return node;
  }
}
