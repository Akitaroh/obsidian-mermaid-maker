/**
 * Atom-XyflowMounter
 *
 * 任意の HTMLElement に React + xyflow キャンバスをマウントする Adapter Atom。
 *
 * Stage 3a: read-only でノード/エッジ表示
 * Stage 3b: ドラッグ → 位置変更通知
 * Stage 3c: ノード CRUD (追加/削除/ラベル編集/エッジ追加削除) を有効化
 * Stage 3d: ノードラベルを renderLabel コールバック経由でリッチ描画
 *
 * 設計判断:
 * - uncontrolled (defaultNodes/defaultEdges) + ReactFlowProvider
 * - 変更通知は `onChange(nodes, edges)` の単一 callback に集約
 * - ノード追加は xyflow の Panel に置く "+" ボタンから（pane click 検出は環境差大）
 * - エッジ重複は handleConnect 内で source+target 一致を弾く
 * - custom node 'mm' の見た目は内部で CSS 注入（mm-node-content + 親に枠）
 */

import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { createRoot, Root } from 'react-dom/client';
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  Background,
  Controls,
  Handle,
  Panel,
  Position,
  type Node as RFNode,
  type Edge as RFEdge,
  type NodeProps,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const STYLE_ID = 'mermaid-maker-canvas-style';
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .react-flow__node-mm {
      background: var(--background-secondary);
      border: 1px solid var(--background-modifier-border);
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 13px;
      color: var(--text-normal);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    }
    .react-flow__node-mm.selected {
      border-color: var(--interactive-accent);
      box-shadow: 0 0 0 2px var(--interactive-accent-hover, var(--interactive-accent));
    }
    /* shape variants */
    .react-flow__node-mm.mm-shape-rounded {
      border-radius: 28px;
    }
    .react-flow__node-mm.mm-shape-circle {
      border-radius: 50%;
      padding: 4px;
    }
    .react-flow__node-mm.mm-shape-doubleCircle {
      border-radius: 50%;
      padding: 4px;
      box-shadow: inset 0 0 0 2px var(--background-primary), inset 0 0 0 3px var(--background-modifier-border);
    }
    .react-flow__node-mm .mm-node-content {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: center;
    }
    .react-flow__node-mm .mm-node-content > p {
      margin: 0;
      padding: 0;
    }
    .mm-add-btn {
      background: var(--interactive-accent);
      color: var(--text-on-accent);
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    .mm-add-btn:hover { opacity: 0.85; }
  `;
  document.head.appendChild(style);
}

export type RenderLabelFn = (label: string, el: HTMLElement) => () => void;

const RenderLabelContext = createContext<RenderLabelFn | null>(null);

export type ChangeNotifier = (nodes: RFNode[], edges: RFEdge[]) => void;

export type MountOptions = {
  nodes: RFNode[];
  edges: RFEdge[];
  theme?: 'light' | 'dark';
  onChange?: ChangeNotifier;
  renderLabel?: RenderLabelFn;
  /** Stage 3c: ノードダブルクリック時のラベル編集 UI を起動するコールバック
   *  Electron 版 Obsidian は window.prompt 無効なので外部から Modal を渡す */
  onEditLabel?: (current: string, onSubmit: (next: string) => void) => void;
};

export type MountHandle = {
  unmount: () => void;
  update: (next: { nodes: RFNode[]; edges: RFEdge[] }) => void;
};

function MMNode(props: NodeProps) {
  const renderLabel = useContext(RenderLabelContext);
  const ref = useRef<HTMLDivElement>(null);
  const data = props.data as { label?: string; shape?: string };
  const label = String(data?.label ?? '');
  const shape = data?.shape ?? 'box';

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // shape class を node の親要素 (.react-flow__node-mm) に乗せる
    const nodeEl = el.closest('.react-flow__node-mm');
    if (nodeEl) {
      nodeEl.classList.remove('mm-shape-box', 'mm-shape-rounded', 'mm-shape-circle', 'mm-shape-doubleCircle');
      nodeEl.classList.add(`mm-shape-${shape}`);
    }
    // innerHTML 代入は Obsidian 審査で flag されるため標準 API を使う
    el.replaceChildren();
    if (renderLabel) {
      const cleanup = renderLabel(label, el);
      return cleanup;
    }
    el.textContent = label;
    return undefined;
  }, [renderLabel, label, shape]);

  return (
    <>
      <Handle type="target" position={Position.Left} />
      <div ref={ref} className="mm-node-content" />
      <Handle type="source" position={Position.Right} />
    </>
  );
}

const NODE_TYPES = { mm: MMNode };

type InnerProps = {
  nodes: RFNode[];
  edges: RFEdge[];
  theme: 'light' | 'dark';
  onChange?: ChangeNotifier;
  onEditLabel?: (current: string, onSubmit: (next: string) => void) => void;
};

function nextNodeId(existing: RFNode[]): string {
  const taken = new Set(existing.map((n) => n.id));
  for (let i = 0; i < 1000; i++) {
    const letter = String.fromCharCode(65 + (i % 26)); // A-Z
    const id = i < 26 ? letter : `${letter}${Math.floor(i / 26)}`;
    if (!taken.has(id)) return id;
  }
  return `N${Date.now()}`;
}

function CanvasInner({ nodes, edges, theme, onChange, onEditLabel }: InnerProps) {
  const { getNodes, getEdges, setNodes, setEdges, getViewport } = useReactFlow();
  const editable = !!onChange;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fireChange = useCallback(() => {
    // unmount 後の遅延イベント (queueMicrotask 越し等) で spurious な空 state を
    // 通知しないよう、mount 状態を確認する
    if (!mountedRef.current) return;
    if (!onChange) return;
    onChange(getNodes(), getEdges());
  }, [onChange, getNodes, getEdges]);

  const handleNodeDragStop = useCallback(() => fireChange(), [fireChange]);
  const handleNodesDelete = useCallback(() => fireChange(), [fireChange]);
  const handleEdgesDelete = useCallback(() => fireChange(), [fireChange]);

  const handleConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return;
      setEdges((es) => {
        // 同 source+target の既存エッジは弾く（多重接続防止）
        const dup = es.some((e) => e.source === conn.source && e.target === conn.target);
        if (dup) return es;
        const id = `e-${conn.source}-${conn.target}`;
        return [
          ...es,
          {
            id,
            source: conn.source as string,
            target: conn.target as string,
          },
        ];
      });
      queueMicrotask(fireChange);
    },
    [setEdges, fireChange],
  );

  const handleNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: RFNode) => {
      if (!editable || !onEditLabel) return;
      const current = String((node.data as { label?: string })?.label ?? '');
      onEditLabel(current, (next) => {
        if (next === current) return;
        setNodes((ns) =>
          ns.map((n) => (n.id === node.id ? { ...n, data: { ...n.data, label: next } } : n)),
        );
        queueMicrotask(fireChange);
      });
    },
    [editable, onEditLabel, setNodes, fireChange],
  );

  /** Panel の "+" ボタンで viewport 中心付近にノード追加 */
  const handleAddNode = useCallback(() => {
    if (!editable) return;
    try {
      const vp = getViewport();
      const flowX = (-vp.x + 200) / vp.zoom;
      const flowY = (-vp.y + 200) / vp.zoom;
      const existing = getNodes();
      const id = nextNodeId(existing);
      setNodes((ns) => [
        ...ns,
        {
          id,
          type: 'mm',
          position: { x: flowX, y: flowY },
          data: { label: id, shape: 'box' },
          style: { width: 160, height: 56 },
          measured: { width: 160, height: 56 },
        },
      ]);
      queueMicrotask(() => {
        try {
          fireChange();
        } catch (e) {
          console.error('[mm-canvas] fireChange after add error', e);
        }
      });
    } catch (e) {
      console.error('[mm-canvas] handleAddNode error', e);
    }
  }, [editable, getViewport, getNodes, setNodes, fireChange]);

  return (
    <ReactFlow
      defaultNodes={nodes}
      defaultEdges={edges}
      nodeTypes={NODE_TYPES}
      fitView
      fitViewOptions={{ padding: 0.2, includeHiddenNodes: true }}
      nodesDraggable={editable}
      nodesConnectable={editable}
      elementsSelectable={editable}
      colorMode={theme}
      proOptions={{ hideAttribution: true }}
      deleteKeyCode={['Backspace', 'Delete']}
      onNodeDragStop={handleNodeDragStop}
      onNodesDelete={handleNodesDelete}
      onEdgesDelete={handleEdgesDelete}
      onConnect={handleConnect}
      onNodeDoubleClick={handleNodeDoubleClick}
    >
      <Background gap={16} />
      <Controls showInteractive={false} />
      {editable && (
        <Panel position="top-right">
          <button className="mm-add-btn" onClick={handleAddNode} title="ノード追加">
            + ノード
          </button>
        </Panel>
      )}
    </ReactFlow>
  );
}

export function mountXyflow(parent: HTMLElement, options: MountOptions): MountHandle {
  injectStyles();
  parent.empty();
  const wrapper = parent.createDiv();
  wrapper.style.cssText = [
    'display: block',
    'box-sizing: border-box',
    'height: 420px',
    'width: 100%',
    'min-width: 320px',
    'border: 1px solid var(--background-modifier-border)',
    'border-radius: 6px',
    'overflow: hidden',
    'position: relative',
  ].join(';');

  const root: Root = createRoot(wrapper);

  let currentNodes = options.nodes;
  let currentEdges = options.edges;

  const render = () => {
    root.render(
      <RenderLabelContext.Provider value={options.renderLabel ?? null}>
        <ReactFlowProvider>
          <CanvasInner
            nodes={currentNodes}
            edges={currentEdges}
            theme={options.theme === 'dark' ? 'dark' : 'light'}
            onChange={options.onChange}
            onEditLabel={options.onEditLabel}
          />
        </ReactFlowProvider>
      </RenderLabelContext.Provider>,
    );
  };

  render();

  return {
    unmount: () => {
      root.unmount();
    },
    update: (next) => {
      currentNodes = next.nodes;
      currentEdges = next.edges;
      render();
    },
  };
}
