import { useState, useCallback, useMemo, useRef } from 'react';
import {
  ReactFlow, Background, Controls,
  applyNodeChanges, applyEdgeChanges,
} from '@xyflow/react';
import type { Edge, Node, NodeChange, EdgeChange } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import axios from 'axios';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  Stethoscope, Plus, Trash2, Loader2, Zap, AlertTriangle,
  Activity, GitBranch, Pill, CheckCircle2,
  ArrowRight, RefreshCw, Download, FileText, X, Sparkles,
  Sun, Moon, Camera, FileImage
} from 'lucide-react';
import { CustomNode } from './components/CustomNode';
import { LandingPage } from './components/LandingPage';
import type { CustomNodeData } from './components/CustomNode';

const API_URL = 'http://localhost:8000';
const nodeTypes = { custom: CustomNode };

interface Alternative {
  original_drug: string;
  suggested_drug: string;
  reason: string;
}

interface Assessment {
  safety_score: number;
  safety_label: string;
  verdict_rationale: string;
  summary: string;
  mechanism: string;
  recommendations: string;
  alternatives: Alternative[];
}

interface InteractionResult {
  status: string;
  drugs_analyzed: string[];
  interactions: { nodes: string[]; relationships: string[] }[];
  safety_score: number;
  safety_label: string;
  verdict_rationale: string;
  summary: string;
  mechanism: string;
  recommendations: string;
  alternatives: Alternative[];
}

// ── Score → visual config ──────────────────────────────────────
const scoreConfig: Record<number, { 
  label: string; color: string; bg: string; border: string; bar: string; icon: React.ReactNode; 
  guidance: string;
}> = {
  1: { 
    label: 'SAFE', color: '#30d158', bg: 'rgba(48,209,88,0.06)', border: 'rgba(48,209,88,0.20)', bar: '#30d158', icon: <CheckCircle2 size={18} />,
    guidance: "Expected Safety: No significant interactions found."
  },
  2: { 
    label: 'CAUTION', color: '#ffd60a', bg: 'rgba(255,214,10,0.06)', border: 'rgba(255,214,10,0.20)', bar: '#ffd60a', icon: <AlertTriangle size={18} />,
    guidance: "Review Recommended: Monitor for cascade effects."
  },
  3: { 
    label: 'DANGER', color: '#ff453a', bg: 'rgba(255,69,58,0.08)', border: 'rgba(255,69,58,0.25)', bar: '#ff453a', icon: <AlertTriangle size={18} />,
    guidance: "Action Required: High-risk interaction detected."
  },
  // Graceful fallbacks for old score ranges
  4: { label: 'DANGER', color: '#ff453a', bg: 'rgba(255,69,58,0.08)', border: 'rgba(255,69,58,0.25)', bar: '#ff453a', icon: <AlertTriangle size={18} />, guidance: "Action Required: Critical risk." },
  5: { label: 'DANGER', color: '#ff453a', bg: 'rgba(255,69,58,0.08)', border: 'rgba(255,69,58,0.25)', bar: '#ff453a', icon: <AlertTriangle size={18} />, guidance: "Emergency: High toxicity risk." },
};

// ── Safety Panel ──────────────────────────────────────────────
function SafetyRatingPanel({
  assessment, onSwap, swapping, onOpenReferral, theme
}: {
  assessment: Assessment;
  onSwap: (orig: string, sugg: string) => void;
  swapping: boolean;
  onOpenReferral: () => void;
  theme: 'dark' | 'light';
}) {
  const cfg = scoreConfig[assessment.safety_score] ?? scoreConfig[2];
  const bars = [1, 2, 3];
  const isDark = theme === 'dark';

  return (
    <div className="fade-up flex flex-col h-full" style={{ borderColor: 'var(--border)' }}>

      {/* Header: score meter + label */}
      <div className="px-5 py-6" style={{ background: cfg.bg, borderBottom: `1px solid var(--border)` }}>
        <div className="flex items-end gap-1.5 mb-5">
          {bars.map(b => (
            <div key={b} className="flex-1 h-3 rounded-full transition-all"
              style={{ background: b <= assessment.safety_score ? cfg.color : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }} />
          ))}
        </div>
        
        <div className="flex items-center gap-2 mb-3">
          <span style={{ color: cfg.color }}>{cfg.icon}</span>
          <span className="text-[16px] font-black tracking-widest uppercase" style={{ color: cfg.color }}>{assessment.safety_label}</span>
          <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold ml-auto" 
            style={{ background: isDark ? 'rgba(255,255,255,0.05)' : '#fff', color: 'var(--muted)', border: '1px solid var(--border)' }}>
            Score {Math.min(3, assessment.safety_score)}/3
          </span>
        </div>

        {/* Verdict Rationale - HIGHLIGHTED */}
        <div className="p-3.5 rounded-xl mb-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderLeft: `3px solid ${cfg.color}` }}>
          <p className="text-[12px] font-bold leading-relaxed mb-1" style={{ color: cfg.color }}>Verdict Rationale:</p>
          <p className="text-[11px] leading-relaxed font-medium" style={{ color: 'var(--text)' }}>
            {assessment.verdict_rationale || assessment.summary || "Pharmacological rationale determined by cascading biological pathway analysis."}
          </p>
        </div>

        {/* Only show summary if it's different from the rationale */}
        {assessment.summary && assessment.summary !== assessment.verdict_rationale && (
          <p className="text-[12px] leading-relaxed font-medium opacity-70" style={{ color: 'var(--text)' }}>{assessment.summary}</p>
        )}
      </div>

      {/* Mechanism */}
      {assessment.mechanism && (
        <div className="px-5 py-5" style={{ background: isDark ? 'rgba(0,0,0,0.28)' : '#fff', borderBottom: `1px solid var(--border)` }}>
          <p className="text-[9px] uppercase tracking-widest font-bold mb-2.5" style={{ color: 'var(--dimmed)' }}>⚗ Biological Mechanism</p>
          <p className="text-[11px] leading-relaxed font-medium" style={{ color: 'var(--text)', opacity: isDark ? 0.6 : 0.7 }}>{assessment.mechanism}</p>
        </div>
      )}

      {/* Recommendation */}
      {assessment.recommendations && (
        <div className="px-5 py-5" style={{ background: isDark ? 'rgba(0,0,0,0.18)' : '#fcfcfd', borderBottom: `1px solid var(--border)` }}>
          <p className="text-[9px] uppercase tracking-widest font-bold mb-2.5" style={{ color: 'var(--dimmed)' }}>💊 Clinical Recommendation</p>
          <p className="text-[11px] leading-relaxed font-medium" style={{ color: 'var(--text)', opacity: isDark ? 0.6 : 0.7 }}>{assessment.recommendations}</p>
        </div>
      )}

      {/* ── Smart Swap ── */}
      {assessment.alternatives && assessment.alternatives.length > 0 && (
        <div className="px-5 py-5" style={{ background: isDark ? 'rgba(48,209,88,0.04)' : 'rgba(48,209,88,0.02)', borderBottom: `1px solid var(--border)` }}>
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={12} color="#30d158" />
            <p className="text-[10px] uppercase tracking-widest font-extrabold" style={{ color: '#30d158' }}>Safer Alternatives</p>
          </div>
          <div className="flex flex-col gap-3">
            {assessment.alternatives.map((alt, i) => (
              <div key={i} className="shadow-sm" style={{ background: isDark ? 'rgba(0,0,0,0.30)' : '#fff', border: `1px solid var(--border)`, borderRadius: '12px', padding: '12px' }}>
                <div className="flex items-center gap-2.5 mb-2.5 flex-wrap">
                  <span style={{ background: 'rgba(255,69,58,0.15)', color: isDark ? '#ff6b63' : '#d70015', border: '1px solid rgba(255,69,58,0.25)', borderRadius: '6px', padding: '3px 10px', fontSize: '11px', fontWeight: 800 }}>{alt.original_drug}</span>
                  <ArrowRight size={13} color="var(--dimmed)" />
                  <span style={{ background: 'rgba(48,209,88,0.13)', color: isDark ? '#30d158' : '#248a3d', border: '1px solid rgba(48,209,88,0.22)', borderRadius: '6px', padding: '3px 10px', fontSize: '11px', fontWeight: 800 }}>{alt.suggested_drug}</span>
                </div>
                <p className="text-[10px] leading-relaxed mb-3 font-medium" style={{ color: 'var(--muted)' }}>{alt.reason}</p>
                <button
                  onClick={() => onSwap(alt.original_drug, alt.suggested_drug)}
                  disabled={swapping}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-bold transition-all shadow-sm"
                  style={{ background: 'rgba(48,209,88,0.10)', color: '#30d158', border: '1px solid rgba(48,209,88,0.20)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(48,209,88,0.18)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(48,209,88,0.10)')}
                >
                  <RefreshCw size={11} /> Swap & Re-analyze
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Export buttons ── */}
      <div className="px-5 py-5 mt-auto flex gap-3">
        <button
          id="btn-export-pdf"
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-bold transition-all shadow-sm"
          style={{
            background: isDark ? 'rgba(255,255,255,0.04)' : '#fff',
            color: 'var(--muted)',
            border: '1px solid var(--border)'
          }}
          onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.09)' : '#f9f9f9')}
          onMouseLeave={e => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : '#fff')}
        >
          <Download size={13} /> Export PDF
        </button>
        <button
          onClick={onOpenReferral}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-bold transition-all shadow-sm"
          style={{
            background: isDark ? 'rgba(255,255,255,0.04)' : '#fff',
            color: 'var(--muted)',
            border: '1px solid var(--border)'
          }}
          onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.09)' : '#f9f9f9')}
          onMouseLeave={e => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : '#fff')}
        >
          <FileText size={13} /> Draft Referral
        </button>
      </div>
    </div>
  );
}


// ── Node classifier ─────────────────────────────────────────────
function classifyNode(id: string, drugs: string[]): CustomNodeData['nodeType'] {
  const l = id.toLowerCase();
  if (drugs.some(d => d.toLowerCase() === l)) return 'drug';
  if (l.startsWith('cyp') || l.includes('enzyme')) return 'enzyme';
  if (l.includes('bleed') || l.includes('toxicity') || l.includes('platelet') || l.includes('pain') || l.includes('risk')) return 'symptom';
  return 'pathway';
}

// ─────────────────────────────────────────────────────────────────
export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [drugs, setDrugs] = useState<string[]>(['Warfarin', 'Glipizide', 'Ibuprofen']);
  const [newDrug, setNewDrug] = useState('');
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [assessment, setAssess] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [view, setView] = useState<'landing' | 'app'>('landing');

  const [hovered, setHovered] = useState<string | null>(null);
  const [tip, setTip] = useState<{ term: string; desc: string } | null>(null);
  const [tipPos, setTipPos] = useState({ x: 0, y: 0 });
  const [tipLoading, setTipLoading] = useState(false);
  const [cache, setCache] = useState<Record<string, string>>({});

  // PDF
  const [exportingPdf, setExportingPdf] = useState(false);
  const graphRef = useRef<HTMLDivElement>(null);

  // Referral modal
  const [referralOpen, setReferralOpen] = useState(false);
  const [specialist, setSpecialist] = useState('Hematology');
  const [referralNote, setReferralNote] = useState('');
  const [genReferral, setGenReferral] = useState(false);

  // Extraction
  const [extracting, setExtracting] = useState(false);
  const [extractedDrugs, setExtractedDrugs] = useState<string[]>([]);
  const [showExtractModal, setShowExtractModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDark = theme === 'dark';

  const onNodesChange = useCallback((c: NodeChange[]) => setNodes(n => applyNodeChanges(c, n)), []);
  const onEdgesChange = useCallback((c: EdgeChange[]) => setEdges(e => applyEdgeChanges(c, e)), []);

  const addDrug = () => {
    const t = newDrug.trim();
    if (t && !drugs.includes(t)) { setDrugs([...drugs, t]); setNewDrug(''); }
  };

  async function fetchTip(term: string, x: number, y: number) {
    setHovered(term); setTipPos({ x, y });
    if (cache[term]) { setTip({ term, desc: cache[term] }); setTipLoading(false); return; }
    setTipLoading(true); setTip({ term, desc: '' });
    try {
      const r = await axios.post(`${API_URL}/api/describe-term`, { term });
      setCache(p => ({ ...p, [term]: r.data.description }));
      setTip({ term, desc: r.data.description });
    } catch { setTip({ term, desc: 'Could not load description.' }); }
    finally { setTipLoading(false); }
  }

  const onNodeEnter = useCallback((e: React.MouseEvent, n: Node) => fetchTip(n.id, e.clientX, e.clientY), [cache]);
  const onNodeMove = useCallback((e: React.MouseEvent) => setTipPos({ x: e.clientX, y: e.clientY }), []);
  const onNodeLeave = useCallback(() => { setHovered(null); setTip(null); }, []);
  const onEdgeEnter = useCallback((e: React.MouseEvent, edge: Edge) =>
    fetchTip((edge.label as string) + ' (pharmacological relationship)', e.clientX, e.clientY), [cache]);
  const onEdgeMove = useCallback((e: React.MouseEvent) => setTipPos({ x: e.clientX, y: e.clientY }), []);
  const onEdgeLeave = useCallback(() => { setHovered(null); setTip(null); }, []);

  const buildGraph = (interactions: InteractionResult['interactions'], drugList: string[]) => {
    const newNodes: Record<string, Node> = {};
    const newEdges: Edge[] = [];
    let y = 60;
    interactions.forEach(path => {
      path.nodes.forEach((id, i) => {
        if (!newNodes[id]) newNodes[id] = {
          id, type: 'custom',
          position: { x: i * 270 + 80, y: y + (i % 2 === 0 ? 0 : 70) },
          data: { label: id, nodeType: classifyNode(id, drugList) },
        };
        if (i < path.relationships.length) {
          const rel = path.relationships[i];
          const tgt = path.nodes[i + 1];
          const eid = `e-${id}-${tgt}-${rel}`;
          if (!newEdges.find(e => e.id === eid)) {
            const danger = rel === 'INHIBITS' || rel === 'CAUSES';
            newEdges.push({
              id: eid, source: id, target: tgt,
              label: rel, animated: true,
              style: { stroke: danger ? '#ff453a' : isDark ? 'rgba(245,245,247,0.30)' : 'rgba(0,0,0,0.15)', strokeWidth: 2 },
              labelStyle: { fill: danger ? '#ff6b63' : isDark ? '#8e8e93' : '#636366', fontWeight: 600, fontSize: 10, fontFamily: 'Inter' },
              labelBgStyle: { fill: isDark ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.95)', rx: 5, ry: 5 },
              labelBgPadding: [6, 3],
              interactionWidth: 18,
            });
          }
        }
      });
      y += 130;
    });
    setNodes(Object.values(newNodes)); setEdges(newEdges);
  };

  const analyze = async (drugList = drugs) => {
    if (!drugList.length) return;
    setLoading(true); setAssess(null); setAnalyzed(false);
    try {
      const { data } = await axios.post<InteractionResult>(`${API_URL}/api/check-interactions`, { drugs: drugList });
      setAssess({
        safety_score: data.safety_score,
        safety_label: data.safety_label,
        verdict_rationale: data.verdict_rationale,
        summary: data.summary,
        mechanism: data.mechanism,
        recommendations: data.recommendations,
        alternatives: data.alternatives ?? [],
      });
      buildGraph(data.interactions, drugList);
      setAnalyzed(true);
    } catch {
      setAssess({
        safety_score: 2,
        safety_label: 'ERROR',
        verdict_rationale: 'System was unable to connect to the pharmacological analysis engine.',
        summary: 'Connection Error: Analysis could not be completed.',
        mechanism: 'Pathways inaccessible.',
        recommendations: 'Please check your internet connection or try again later.',
        alternatives: [],
      });
    } finally { setLoading(false); }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setExtracting(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const { data } = await axios.post<{ drugs: string[] }>(`${API_URL}/api/extract-medicine`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (data.drugs && data.drugs.length > 0) {
        setExtractedDrugs(data.drugs);
        setShowExtractModal(true);
      } else {
        alert("No medications found in the image. Please try again with a clearer photo.");
      }
    } catch (error) {
      console.error("Extraction error:", error);
      alert("Failed to extract medications. Please try again.");
    } finally {
      setExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const confirmExtractedDrugs = (selected: string[]) => {
    const filtered = selected.filter(d => !drugs.includes(d));
    if (filtered.length > 0) {
      setDrugs([...drugs, ...filtered]);
    }
    setShowExtractModal(false);
    setExtractedDrugs([]);
  };

  const swapAndReanalyze = async (original: string, suggested: string) => {
    setSwapping(true);
    const updated = drugs.map(d => d.toLowerCase() === original.toLowerCase() ? suggested : d);
    setDrugs(updated);
    await analyze(updated);
    setSwapping(false);
  };

  const exportPDF = async () => {
    if (!assessment || !graphRef.current) return;
    setExportingPdf(true);
    try {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const margin = 20;
      const usableW = 210 - margin * 2;
      const cfg = scoreConfig[assessment.safety_score] ?? scoreConfig[3];

      const hexToRgb = (hex: string) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return { r, g, b };
      };
      const accentRgb = hexToRgb(cfg.color);

      let currentY = 15;
      const checkPageBreak = (needed: number) => {
        if (currentY + needed > 275) {
          doc.addPage();
          currentY = 20;
          return true;
        }
        return false;
      };

      // ── ENHANCED CLINICAL HEADER ──
      doc.setFillColor(242, 242, 247);
      doc.rect(0, 0, 210, 45, 'F');

      doc.setTextColor(accentRgb.r, accentRgb.g, accentRgb.b);
      doc.setFontSize(22); doc.setFont('helvetica', 'bold');
      doc.text('Phos AI', margin, 18);
      
      doc.setTextColor(60, 60, 70);
      doc.setFontSize(10); doc.setFont('helvetica', 'normal');
      doc.text('PHOS NEURO-DIGITAL HEALTH CENTER', margin, 23);

      doc.setTextColor(29, 29, 31);
      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.text('PHARMACOLOGICAL ANALYSIS & RISK ASSESSMENT', margin, 32);

      const reportId = `MC-${Math.random().toString(36).substring(7).toUpperCase()}`;
      doc.setTextColor(140, 140, 150);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      doc.text(`REPORT ID: ${reportId}`, margin, 38);
      doc.text(`GENERATED: ${new Date().toLocaleString().toUpperCase()}`, margin + 65, 38);
      doc.text('RESTRICTED CLINICAL BRIEF', 210 - margin - 42, 38);

      // ── PATIENT PROFILE SECTION ──
      currentY = 55;
      doc.setDrawColor(230, 230, 235);
      doc.setLineWidth(0.1);
      doc.line(margin, currentY, 210 - margin, currentY);
      
      currentY += 8;
      doc.setTextColor(100, 100, 110);
      doc.setFontSize(8); doc.setFont('helvetica', 'bold');
      doc.text('PATIENT PROFILE', margin, currentY);
      
      currentY += 6;
      doc.setTextColor(40, 40, 45);
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      doc.text('NAME: [CONFIDENTIAL PATIENT]', margin, currentY);
      doc.text('DOB: 12-MAY-1985', margin + 60, currentY);
      doc.text('SEX: M', margin + 110, currentY);
      doc.text('ID: PT-8829-X', margin + 140, currentY);

      currentY += 12;

      // ── RISK PROFILE CARD (Refined) ──
      doc.setDrawColor(accentRgb.r, accentRgb.g, accentRgb.b);
      doc.setLineWidth(0.5);
      doc.setFillColor(252, 252, 254);

      const summaryLines = doc.splitTextToSize(assessment.summary, usableW - 12);
      const rationaleLines = doc.splitTextToSize(assessment.verdict_rationale, usableW - 12);
      const cardH = 25 + (summaryLines.length * 5.2) + 12 + (rationaleLines.length * 5);

      // @ts-ignore
      doc.roundedRect(margin, currentY, usableW, cardH, 0.5, 0.5, 'FD');

      // Status Box (Weighted)
      doc.setFillColor(accentRgb.r, accentRgb.g, accentRgb.b);
      doc.rect(margin + 5, currentY + 5, 40, 10, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10); doc.setFont('helvetica', 'bold');
      doc.text(assessment.safety_label, margin + 25, currentY + 11.5, { align: 'center' });

      doc.setTextColor(accentRgb.r, accentRgb.g, accentRgb.b);
      doc.setFontSize(9.5);
      doc.text(`SEVERITY INDEX: ${assessment.safety_score}.0 / 3.0`, 210 - margin - 45, currentY + 11.5);

      currentY += 22;
      doc.setTextColor(accentRgb.r, accentRgb.g, accentRgb.b);
      doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');
      doc.text('CLINICAL RATIONALE:', margin + 6, currentY);
      
      doc.setTextColor(40, 40, 45); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      doc.text(rationaleLines, margin + 6, currentY + 5);
      
      currentY += (rationaleLines.length * 5) + 8;
      
      doc.setTextColor(accentRgb.r, accentRgb.g, accentRgb.b);
      doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');
      doc.text('EXECUTIVE SUMMARY:', margin + 6, currentY);

      doc.setTextColor(60, 60, 70); doc.setFontSize(9.5); doc.setFont('helvetica', 'normal');
      doc.text(summaryLines, margin + 6, currentY + 6);

      currentY += cardH - (22 + (rationaleLines.length * 5)) + 15;

      // ── SECTION RENDERER ──
      const addSection = (title: string, content: string, color: { r: number, g: number, b: number }) => {
        const lines = doc.splitTextToSize(content, usableW);
        const needed = 20 + (lines.length * 5.5);
        checkPageBreak(needed);

        doc.setTextColor(color.r, color.g, color.b);
        doc.setFontSize(9); doc.setFont('helvetica', 'bold');
        doc.text(title.toUpperCase(), margin, currentY);

        currentY += 4;
        doc.setDrawColor(color.r, color.g, color.b);
        doc.setLineWidth(0.3);
        doc.line(margin, currentY, margin + 15, currentY);

        currentY += 8;
        doc.setTextColor(29, 29, 31);
        doc.setFontSize(10); doc.setFont('helvetica', 'normal');
        doc.text(lines, margin, currentY);

        currentY += (lines.length * 5.5) + 12;
      };

      addSection('Active Pharmacological Regimen', drugs.join(', '), { r: 60, g: 60, b: 70 });

      if (assessment.mechanism) {
        addSection('Pathway Analysis & Biological Cascade', assessment.mechanism, { r: 10, g: 132, b: 255 });
      }
      if (assessment.recommendations) {
        addSection('Clinical Intervention Plan', assessment.recommendations, { r: 184, g: 134, b: 11 });
      }

      // ── DATA VISUALIZATION ──
      checkPageBreak(90);
      doc.setTextColor(150, 150, 160);
      doc.setFontSize(8); doc.setFont('helvetica', 'bold');
      doc.text('KNOWLEDGE GRAPH EVIDENCE (BIOLOGICAL NETWORK)', margin, currentY);
      currentY += 6;

      const canvas = await html2canvas(graphRef.current, {
        backgroundColor: '#ffffff',
        scale: 2.5,
        logging: false,
        useCORS: true
      });
      const imgH = (canvas.height / canvas.width) * usableW;
      const fitH = Math.min(imgH, 85);

      doc.setDrawColor(235, 235, 240);
      doc.setLineWidth(0.2);
      // @ts-ignore
      doc.roundedRect(margin - 1, currentY - 1, usableW + 2, fitH + 2, 0.5, 0.5, 'D');
      doc.addImage(canvas.toDataURL('image/png'), 'PNG', margin, currentY, usableW, fitH);

      currentY += fitH + 18;

      // ── RESOLUTION TABLE ──
      if (assessment.alternatives && assessment.alternatives.length > 0) {
          checkPageBreak(40);
          doc.setTextColor(0, 0, 0);
          doc.setFontSize(11); doc.setFont('helvetica', 'bold');
          doc.text('SUGGESTED CLINICAL RESOLUTIONS', margin, currentY);
          currentY += 8;

          assessment.alternatives.forEach((alt) => {
              const rLines = doc.splitTextToSize(`RATIONALE: ${alt.reason}`, usableW - 15);
              const blockH = 18 + (rLines.length * 5);
              checkPageBreak(blockH);

              doc.setFillColor(248, 250, 248);
              doc.setDrawColor(accentRgb.r, accentRgb.g, accentRgb.b);
              doc.setLineWidth(0.1);
              // @ts-ignore
              doc.roundedRect(margin, currentY, usableW, blockH, 0.5, 0.5, 'FD');

              doc.setTextColor(215, 0, 21); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
              doc.text(`REMOVE: ${alt.original_drug}`, margin + 5, currentY + 7);

              doc.setTextColor(34, 139, 34); doc.text(`SUBSTITUTE WITH: ${alt.suggested_drug}`, margin + 70, currentY + 7);

              doc.setTextColor(70, 70, 80); doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
              doc.text(rLines, margin + 5, currentY + 14);

              currentY += blockH + 6;
          });
      }

      // ── SIGNATURE AREA ──
      checkPageBreak(40);
      currentY += 10;
      doc.setDrawColor(200, 200, 205);
      doc.setLineWidth(0.1);
      doc.line(margin, currentY, margin + 60, currentY);
      doc.line(margin + 100, currentY, margin + 160, currentY);
      
      currentY += 5;
      doc.setTextColor(120, 120, 130);
      doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
      doc.text('ATTENDING PHYSICIAN SIGNATURE', margin, currentY);
      doc.text('DATE OF REVIEW', margin + 100, currentY);

      // ── FOOTER PAGE LOGIC ──
      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setDrawColor(235, 235, 242);
        doc.line(margin, 285, 210 - margin, 285);

        doc.setFontSize(7.5); doc.setTextColor(170, 170, 180); doc.setFont('helvetica', 'italic');
        doc.text(`Phos AI Clinical Intelligence Report PH-INTX • Page ${i} of ${totalPages}`, margin, 291);
        doc.text('OFFICIAL MEDICAL DOCUMENT • NOT FOR DIRECT DIAGNOSIS', 210 - margin - 85, 291);
      }

      doc.save(`Phos_Analysis_${reportId}_${Date.now()}.pdf`);
    } catch (e) {
      console.error('PDF Generation Failure:', e);
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportClick = useCallback(() => exportPDF(), [assessment, drugs]);

  const generateReferral = async () => {
    if (!assessment) return;
    setGenReferral(true);
    try {
      const { data } = await axios.post<{ referral_note: string }>(`${API_URL}/api/generate-referral`, {
        drugs,
        safety_label: assessment.safety_label,
        mechanism: assessment.mechanism,
        specialist_type: specialist,
      });
      setReferralNote(data.referral_note);
    } catch { setReferralNote('Failed to generate. Please try again.'); }
    finally { setGenReferral(false); }
  };

  const stats = useMemo(() => ({ drugs: drugs.length, nodes: nodes.length, edges: edges.length }), [drugs, nodes, edges]);
  const accentColor = assessment ? (scoreConfig[assessment.safety_score]?.color ?? '#30d158') : '#30d158';

  if (view === 'landing') {
    return <LandingPage onLaunch={() => setView('app')} />;
  }

  return (
    <div className={`flex h-screen w-screen overflow-hidden transition-colors duration-500 ${isDark ? '' : 'light-mode'}`} style={{ background: 'var(--bg)' }}>

      {/* ━━━━ AMBIENT GLASS BACKGROUND ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="bg-decoration">
        {/* Dynamic Orbs */}
        <div className="orb w-[60vw] h-[60vh] top-[-10%] left-[-10%] orb-anim"
          style={{ background: `radial-gradient(circle, ${accentColor}33 0%, transparent 70%)` }} />
        <div className="orb w-[50vw] h-[50vh] bottom-[-5%] right-[-5%] orb-anim-r"
          style={{ background: 'radial-gradient(circle, rgba(10,132,255,0.2) 0%, transparent 70%)' }} />
        <div className="orb w-[40vw] h-[40vh] top-[30%] left-[40%] orb-anim"
          style={{ background: 'radial-gradient(circle, rgba(255,214,10,0.12) 0%, transparent 70%)' }} />
      </div>

      {/* ━━━━ SIDEBAR (Pane 1: Frosted Metal) ━━━━━━━━━━━━━━━━━━━━━━ */}
      <aside className={`relative z-10 w-[355px] flex flex-col transition-all duration-500 glass-sidebar`}>

        {/* Brand */}
        <div className="px-6 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-[10px]" style={{ background: 'rgba(48,209,88,0.10)', border: '1px solid rgba(48,209,88,0.18)' }}>
              <Stethoscope size={17} style={{ color: '#30d158' }} />
            </div>
            <div>
              <p className="text-[16px] font-bold tracking-[-0.03em]" style={{ color: 'var(--text)' }}>Phos AI</p>
              <p className="text-[9px] tracking-widest uppercase" style={{ color: 'var(--dimmed)' }}>Drug Interaction Intelligence</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {['Multi-drug', 'Enzyme Pathways', 'AI Synthesis', 'Safety Rating'].map(b => (
              <span key={b} className="text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(48,209,88,0.08)', color: '#30d158', border: '1px solid rgba(48,209,88,0.12)' }}>
                ✓ {b}
              </span>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3" style={{ borderBottom: '1px solid var(--border)' }}>
          {[
            { icon: <Pill size={10} />, l: 'Drugs', v: stats.drugs },
            { icon: <GitBranch size={10} />, l: 'Nodes', v: stats.nodes },
            { icon: <Activity size={10} />, l: 'Edges', v: stats.edges },
          ].map((s, i) => (
            <div key={s.l} className="flex flex-col items-center py-3"
              style={{ borderRight: i < 2 ? '1px solid var(--border)' : 'none' }}>
              <div className="flex items-center gap-1 text-[8px] uppercase tracking-widest mb-1" style={{ color: 'var(--dimmed)' }}>{s.icon} {s.l}</div>
              <span className="text-[20px] font-bold" style={{ color: 'var(--text)', letterSpacing: '-0.04em' }}>{s.v}</span>
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="px-6 pt-5 pb-3">
          <p className="text-[9px] font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--dimmed)' }}>Patient Regimen</p>
          <div className="flex gap-2 mb-3">
            <input className="mac-input flex-1 rounded-xl px-4 py-2.5 text-sm"
              placeholder="Add medication…" value={newDrug}
              onChange={e => setNewDrug(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addDrug()} />
            <button onClick={addDrug}
              className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0 transition-all btn-primary">
              <Plus size={17} />
            </button>
          </div>
          
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={handleImageUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={extracting}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-bold transition-all shadow-sm"
            style={{ 
              background: isDark ? 'rgba(48,209,88,0.10)' : 'rgba(48,209,88,0.05)', 
              color: '#30d158', 
              border: '1px solid rgba(48,209,88,0.20)' 
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(48,209,88,0.18)')}
            onMouseLeave={e => (e.currentTarget.style.background = isDark ? 'rgba(48,209,88,0.10)' : 'rgba(48,209,88,0.05)')}
          >
            {extracting ? <><Loader2 className="animate-spin" size={13} /> Analyzing Photo…</> : <><Camera size={13} /> Scan Medicine Image</>}
          </button>
        </div>

        {/* Drug List */}
        <div className="flex-1 overflow-y-auto px-6 space-y-1.5">
          {drugs.map((drug, i) => (
            <div key={drug}
              className="fade-up group flex items-center justify-between rounded-2xl px-4 py-3 transition-all"
              style={{ background: isDark ? 'rgba(255,255,255,0.033)' : 'rgba(0,0,0,0.02)', border: '1px solid var(--border)', animationDelay: `${i * 40}ms` }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(48,209,88,0.22)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
              <div className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-lg text-[10px] font-bold flex items-center justify-center"
                  style={{ background: 'rgba(48,209,88,0.10)', color: '#30d158' }}>{i + 1}</span>
                <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{drug}</span>
              </div>
              <button onClick={() => setDrugs(drugs.filter(d => d !== drug))}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                style={{ color: 'var(--danger)', opacity: 0.5 }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {!drugs.length && <p className="text-center text-sm italic py-6" style={{ color: 'var(--dimmed)' }}>No medications added.</p>}
        </div>

        {/* Analyze CTA */}
        <div className="px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={() => analyze()} disabled={loading || !drugs.length}
            className="btn-primary w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm shadow-xl">
            {loading ? <><Loader2 className="animate-spin" size={15} /> Analyzing…</> : <><Zap size={15} /> Analyze Multi-Drug Cascade</>}
          </button>
        </div>
      </aside>

      {/* ━━━━ MAIN CANVAS (Pane 2: Clear Glass) ━━━━━━━━━━━━━━━━━━━━━ */}
      <main className="relative flex-1 flex flex-col z-10 min-h-0 glass-canvas">

        {/* Top Bar */}
        <div className={`transition-all duration-500 ${isDark ? 'glass' : 'bg-white shadow-sm'} px-8 py-4 flex items-end justify-between shrink-0`}
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            {!analyzed ? (
              <>
                <h2 className="text-[26px] font-bold tracking-[-0.04em] leading-none" style={{ color: 'var(--text)' }}>
                  See what your <span style={{ color: '#30d158' }}>prescriptions</span><br />don't tell you.
                </h2>
                <p className="text-[12px] mt-2" style={{ color: 'var(--muted)' }}>
                  Multi-hop biological cascade detection powered by a live Knowledge Graph + AI safety rating.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-[19px] font-bold tracking-[-0.03em]" style={{ color: 'var(--text)' }}>Biological Interaction Graph</h2>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--dimmed)' }}>
                  {nodes.length} entities · {edges.length} cascading pathways detected
                </p>
              </>
            )}
          </div>

          <div className="flex items-center gap-6">
            {analyzed && (
              <div className="flex items-center gap-4 pb-0.5">
                {[{ c: '#6366f1', l: 'Drug' }, { c: '#f59e0b', l: 'Enzyme' }, { c: '#ef4444', l: 'Symptom' }, { c: '#14b8a6', l: 'Pathway' }].map(x => (
                  <div key={x.l} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ background: x.c }} />
                    <span className="text-[10px]" style={{ color: 'var(--dimmed)' }}>{x.l}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 🌗 THEME TOGGLE 🌗 */}
            <button
              onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
              className="p-2.5 rounded-full transition-all hover:scale-110 active:scale-95"
              style={{
                background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                border: '1px solid var(--border)',
                color: 'var(--text)'
              }}
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>

        {/* Content row */}
        <div className="flex flex-1 min-h-0">

          {/* Graph */}
          <div ref={graphRef} className="relative flex-1 min-h-0">
            {!analyzed && !loading && (
              <div className="absolute inset-0 flex items-center justify-center z-0 pointer-events-none">
                <p className="text-[12px]" style={{ color: 'var(--dimmed)' }}>
                  Add medications → click <span style={{ color: '#30d158' }}>Analyze Multi-Drug Cascade</span>
                </p>
              </div>
            )}
            <ReactFlow
              nodes={nodes} edges={edges} nodeTypes={nodeTypes}
              onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
              onNodeMouseEnter={onNodeEnter} onNodeMouseMove={onNodeMove} onNodeMouseLeave={onNodeLeave}
              onEdgeMouseEnter={onEdgeEnter} onEdgeMouseMove={onEdgeMove} onEdgeMouseLeave={onEdgeLeave}
              fitView fitViewOptions={{ padding: 0.18 }}
              style={{ background: 'transparent', width: '100%', height: '100%' }}
            >
              <Background color={isDark ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.04)"} gap={28} size={1} />
              <Controls style={{ background: isDark ? 'rgba(18,18,18,.85)' : 'rgba(255,255,255,0.95)', border: '1px solid var(--border)' }} />
            </ReactFlow>
          </div>

          {/* Risk Assessment (Pane 3: High-Contrast Glass) */}
          {assessment && (
            <div
              className={`shrink-0 overflow-y-auto transition-all duration-500 glass-panel`}
              style={{ width: '380px' }}
              onClick={e => { if ((e.target as HTMLElement).id === 'btn-export-pdf') handleExportClick(); }}
            >
              {exportingPdf && (
                <div className="flex items-center justify-center p-4 gap-2 text-[11px]" style={{ color: 'var(--muted)' }}><Loader2 className="animate-spin" size={14} /> Generating PDF…</div>
              )}
              <SafetyRatingPanel
                assessment={assessment}
                onSwap={swapAndReanalyze}
                swapping={swapping}
                onOpenReferral={() => { setReferralNote(''); setReferralOpen(true); }}
                theme={theme}
              />
            </div>
          )}
        </div>
      </main>

      {/* ━━━━ TOOLTIP ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {hovered && tip && (
        <div className="fixed z-50 pointer-events-none fade-up"
          style={{
            left: tipPos.x, top: tipPos.y - 14,
            transform: 'translate(-50%, -100%)',
            background: isDark ? 'rgba(10,10,10,0.93)' : 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid var(--border)',
            borderRadius: '12px', padding: '10px 13px',
            maxWidth: '270px',
            boxShadow: isDark ? '0 16px 40px rgba(0,0,0,0.8)' : '0 16px 40px rgba(0,0,0,0.12)',
          }}>
          <div className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-full">
            <div style={{ width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: `6px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)'}` }} />
          </div>
          <p className="font-semibold text-[12px] mb-1.5" style={{ color: '#30d158' }}>
            {tip.term.replace(' (pharmacological relationship)', '')}
          </p>
          {tipLoading
            ? <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--dimmed)' }}><Loader2 className="animate-spin" size={10} /> Generating…</div>
            : <p className="text-[11px] leading-relaxed" style={{ color: 'var(--muted)' }}>{tip.desc}</p>
          }
        </div>
      )}

      {/* ━━━━ REFERRAL MODAL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {referralOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className={`relative w-full max-w-[540px] max-h-[85vh] overflow-y-auto rounded-3xl p-8 transition-all duration-500 ${isDark ? '' : 'bg-white shadow-2xl'}`}
            style={{
              background: isDark ? 'rgba(15,15,20,0.98)' : '#fff',
              border: '1px solid var(--border)',
              boxShadow: isDark ? '0 40px 80px rgba(0,0,0,0.8)' : '0 40px 80px rgba(0,0,0,0.15)'
            }}>
            <button onClick={() => setReferralOpen(false)}
              className="absolute top-6 right-6" style={{ color: 'var(--dimmed)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--dimmed)')}>
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-[12px]" style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.20)' }}>
                <FileText size={16} style={{ color: '#818cf8' }} />
              </div>
              <div>
                <p className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>Draft Specialist Referral</p>
                <p className="text-[10px]" style={{ color: 'var(--dimmed)' }}>AI-generated clinical draft.</p>
              </div>
            </div>

            <label className="block text-[9px] uppercase tracking-widest font-bold mb-2.5" style={{ color: 'var(--dimmed)' }}>Referring to Specialist</label>
            <select
              value={specialist}
              onChange={e => setSpecialist(e.target.value)}
              className="mac-input w-full rounded-xl px-4 py-3 text-sm mb-5 font-medium outline-none"
            >
              {['Hematology', 'Cardiology', 'Nephrology', 'Clinical Pharmacology', 'Internal Medicine'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <button
              onClick={generateReferral}
              disabled={genReferral}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold mb-5 transition-all"
              style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.22)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.25)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.15)')}
            >
              {genReferral ? <><Loader2 className="animate-spin" size={14} /> Generating…</> : <><Sparkles size={14} /> Generate Clinical Note</>}
            </button>

            {referralNote && (
              <div className="fade-up">
                <textarea
                  value={referralNote}
                  onChange={e => setReferralNote(e.target.value)}
                  rows={9}
                  className="mac-input w-full rounded-xl px-4 py-3.5 text-sm mb-4"
                  style={{ lineHeight: 1.8, resize: 'vertical' }}
                />
                <button
                  onClick={() => navigator.clipboard.writeText(referralNote)}
                  className="w-full py-3 rounded-xl text-[11px] font-bold transition-all shadow-sm"
                  style={{ background: isDark ? 'rgba(255,255,255,0.04)' : '#f5f5f7', color: 'var(--muted)', border: '1px solid var(--border)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.08)' : '#eee')}
                  onMouseLeave={e => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : '#f5f5f7')}
                >
                  Copy to Clipboard
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ━━━━ EXTRACTION MODAL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {showExtractModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className={`relative w-full max-w-[420px] rounded-3xl p-8 transition-all duration-500 fade-up ${isDark ? '' : 'bg-white shadow-2xl'}`}
            style={{
              background: isDark ? 'rgba(15,15,20,0.98)' : '#fff',
              border: '1px solid var(--border)',
              boxShadow: isDark ? '0 40px 80px rgba(0,0,0,0.8)' : '0 40px 80px rgba(0,0,0,0.15)'
            }}>
            
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-[12px]" style={{ background: 'rgba(48,209,88,0.12)', border: '1px solid rgba(48,209,88,0.20)' }}>
                <FileImage size={18} style={{ color: '#30d158' }} />
              </div>
              <div>
                <p className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>Detection Results</p>
                <p className="text-[10px]" style={{ color: 'var(--dimmed)' }}>Medications extracted from photo.</p>
              </div>
            </div>

            <p className="text-[11px] mb-4" style={{ color: 'var(--muted)' }}>
              The following medications were detected. Click "Add" to include them in your list.
            </p>

            <div className="space-y-2 mb-8 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
              {extractedDrugs.map((drug) => {
                const isExisting = drugs.includes(drug);
                return (
                  <div key={drug} 
                    className="flex items-center justify-between p-3 rounded-xl"
                    style={{ background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', border: '1px solid var(--border)' }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full" style={{ background: '#30d158' }} />
                      <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{drug}</span>
                    </div>
                    {isExisting ? (
                      <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded-full" 
                        style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--dimmed)' }}>In List</span>
                    ) : (
                      <span className="text-[9px] uppercase font-bold text-[#30d158]">New</span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowExtractModal(false)}
                className="flex-1 py-3 rounded-xl text-[11px] font-bold transition-all"
                style={{ background: 'transparent', color: 'var(--dimmed)', border: '1px solid var(--border)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => confirmExtractedDrugs(extractedDrugs)}
                className="flex-[2] btn-primary py-3 rounded-xl text-[11px] font-bold shadow-lg"
              >
                Add All Medications
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
