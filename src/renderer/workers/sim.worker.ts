import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, type SimulationNodeDatum, type SimulationLinkDatum } from 'd3-force';

interface SimNode extends SimulationNodeDatum {
  id: string;
  weight: number;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  weight: number;
}

interface InitMessage {
  type: 'init';
  nodes: Array<{ id: string; weight: number; x?: number; y?: number }>;
  links: Array<{ source: string; target: string; weight: number }>;
}

const ctx = self as unknown as Worker;
let simulation: ReturnType<typeof forceSimulation<SimNode>> | null = null;

// Node `weight` is the degree (number of connections). Heavier nodes get a
// bigger collision radius and a stronger charge, so hubs do not get crushed.
const collideRadius = (node: SimNode): number => 4 + Math.sqrt(node.weight) * 2;
const chargeStrength = (node: SimNode): number => -120 - node.weight * 12;

ctx.onmessage = (event: MessageEvent<InitMessage>) => {
  const { nodes, links } = event.data;
  simulation?.stop();

  // Seed with previous positions so a rebuild does not reshuffle the layout.
  const simNodes: SimNode[] = nodes.map((node) => ({ id: node.id, weight: node.weight, x: node.x, y: node.y }));
  const simLinks: SimLink[] = links.map((link) => ({ ...link }));

  simulation = forceSimulation(simNodes)
    .force(
      'link',
      forceLink<SimNode, SimLink>(simLinks)
        .id((node) => node.id)
        .distance((link) => 60 + Math.min(link.weight, 4) * 6)
        .strength((link) => 0.4 + Math.min(link.weight, 3) * 0.1),
    )
    .force('charge', forceManyBody<SimNode>().strength(chargeStrength))
    .force('center', forceCenter(0, 0))
    .force('collide', forceCollide<SimNode>(collideRadius))
    .alphaDecay(0.02);

  let tick = 0;
  simulation.on('tick', () => {
    if (tick++ % 2 !== 0) return;
    ctx.postMessage({
      type: 'tick',
      nodes: simNodes.map((node) => ({ id: node.id, x: node.x ?? 0, y: node.y ?? 0 })),
    });
  });

  ctx.postMessage({ type: 'started', nodes: simNodes.map((node) => ({ id: node.id, x: node.x ?? 0, y: node.y ?? 0 })) });
};
