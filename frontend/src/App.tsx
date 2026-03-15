import { useState, useCallback, useRef } from 'react';
import { ReactFlow, Background, Controls, applyNodeChanges, applyEdgeChanges } from '@xyflow/react';
import type { Edge, Node, NodeChange, EdgeChange } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import axios from 'axios';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Stethoscope, AlertTriangle, Plus, Trash2, Loader2, ArrowRight, RefreshCw, FileText, X, Download, Sparkles } from 'lucide-react';

const API_URL = "http://localhost:8000";

interface Alternative {
  original_drug: string;
  suggested_drug: string;
  reason: string;
}

interface InteractionResult {
  status: string;
  drugs_analyzed: string[];
  interactions: { nodes: string[]; relationships: string[] }[];
  warning: string;
  safety_score: number;
  safety_label: string;
  summary: string;
  mechanism: string;
  recommendations: string;
  alternatives: Alternative[];
}

const SEVERITY_COLORS: Record<number, { bg: string; border: string; text: string; badge: string }> = {
  1: { bg: 'rgba(6, 78, 59, 0.3)',  border: 'rgba(16, 185, 129, 0.4)', text: '#6ee7b7', badge: '#10b981' },
  2: { bg: 'rgba(7, 89, 133, 0.3)', border: 'rgba(56, 189, 248, 0.4)', text: '#7dd3fc', badge: '#38bdf8' },
  3: { bg: 'rgba(78, 63, 0, 0.4)',  border: 'rgba(234, 179, 8, 0.4)',  text: '#fde047', badge: '#eab308' },
  4: { bg: 'rgba(69, 10, 10, 0.4)', border: 'rgba(127, 29, 29, 0.5)', text: '#f87171', badge: '#ef4444' },
  5: { bg: 'rgba(88, 0, 0, 0.5)',   border: 'rgba(185, 28, 28, 0.6)', text: '#fca5a5', badge: '#dc2626' },
};

function App() {
  const [drugs, setDrugs] = useState<string[]>(['Warfarin', 'Glipizide', 'Ibuprofen']);
  const [newDrug, setNewDrug] = useState('');
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [result, setResult] = useState<InteractionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Referral modal state
  const [referralModal, setReferralModal] = useState(false);
  const [specialistType, setSpecialistType] = useState('Hematology');
  const [referralNote, setReferralNote] = useState('');
  const [generatingReferral, setGeneratingReferral] = useState(false);

  const graphRef = useRef<HTMLDivElement>(null);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const addDrug = () => {
    if (newDrug.trim() && !drugs.includes(newDrug.trim())) {
      setDrugs([...drugs, newDrug.trim()]);
      setNewDrug('');
    }
  };

  const removeDrug = (drug: string) => {
    setDrugs(drugs.filter((d) => d !== drug));
  };

  const buildGraph = (interactions: InteractionResult['interactions'], drugList: string[]) => {
    const newNodes: Record<string, Node> = {};
    const newEdges: Edge[] = [];
    let yPos = 50;
    interactions.forEach((path) => {
      path.nodes.forEach((nodeId, idx) => {
        if (!newNodes[nodeId]) {
          const isDrug = drugList.map(d => d.toLowerCase()).includes(nodeId.toLowerCase());
          const isSymptom = !isDrug && !nodeId.startsWith('CYP');
          newNodes[nodeId] = {
            id: nodeId,
            position: { x: idx * 250 + 50, y: yPos + (idx % 2 === 0 ? 0 : 50) },
            data: { label: nodeId },
            style: {
              background: isDrug ? '#3b82f6' : isSymptom ? '#f97316' : '#f59e0b',
              color: 'white',
              border: '1px solid #475569',
              borderRadius: '8px',
              padding: '10px 20px',
              fontWeight: 'bold',
              boxShadow: isDrug ? '0 0 15px rgba(59, 130, 246, 0.5)' : 'none',
            }
          };
        }
        if (idx < path.relationships.length) {
          const relType = path.relationships[idx];
          const targetId = path.nodes[idx + 1];
          const edgeId = `e-${nodeId}-${targetId}-${relType}`;
          if (!newEdges.find(e => e.id === edgeId)) {
            newEdges.push({
              id: edgeId,
              source: nodeId,
              target: targetId,
              label: relType,
              animated: true,
              style: { stroke: relType === 'INHIBITS' || relType === 'CAUSES' ? '#ef4444' : '#94a3b8', strokeWidth: 2 },
              labelStyle: { fill: '#cbd5e1', fontWeight: 700, fontSize: 12 },
              labelBgStyle: { fill: '#0f172a' }
            });
          }
        }
      });
      yPos += 100;
    });
    setNodes(Object.values(newNodes));
    setEdges(newEdges);
  };

  const analyze = async (drugList = drugs) => {
    if (drugList.length === 0) return;
    setLoading(true);
    setResult(null);
    try {
      const response = await axios.post<InteractionResult>(`${API_URL}/api/check-interactions`, { drugs: drugList });
      setResult(response.data);
      buildGraph(response.data.interactions, drugList);
    } catch (err) {
      console.error(err);
      setResult({ status: 'error', drugs_analyzed: drugList, interactions: [], warning: "Failed to fetch interactions.", safety_score: 3, safety_label: "UNKNOWN", summary: "Failed to fetch interactions. Ensure backend is running.", mechanism: "", recommendations: "", alternatives: [] });
    } finally {
      setLoading(false);
    }
  };

  const swapAndReanalyze = (original: string, suggested: string) => {
    const updated = drugs.map(d => d.toLowerCase() === original.toLowerCase() ? suggested : d);
    setDrugs(updated);
    analyze(updated);
  };

  const exportPDF = async () => {
    if (!result || !graphRef.current) return;
    setExportingPdf(true);
    try {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageW = 210;
      const margin = 15;
      const usableW = pageW - margin * 2;

      // Header
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageW, 28, 'F');
      doc.setTextColor(248, 250, 252);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('MedCascade Clinical Interaction Brief', margin, 12);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text(`Generated: ${new Date().toLocaleString()}`, margin, 21);

      let y = 36;

      // Drug Regimen
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Drug Regimen', margin, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85);
      result.drugs_analyzed.forEach((d, i) => {
        doc.text(`${i + 1}. ${d}`, margin + 4, y);
        y += 5;
      });
      y += 4;

      // Risk Level
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      doc.text(`Risk Level: ${result.safety_label} (Score ${result.safety_score}/5)`, margin, y);
      y += 8;

      // Summary
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Summary', margin, y); y += 5;
      doc.setFont('helvetica', 'normal'); doc.setTextColor(51, 65, 85);
      const summaryLines = doc.splitTextToSize(result.summary, usableW);
      doc.text(summaryLines, margin, y); y += summaryLines.length * 5 + 4;

      // Mechanism
      doc.setTextColor(30, 41, 59); doc.setFont('helvetica', 'bold'); doc.text('Biological Mechanism', margin, y); y += 5;
      doc.setFont('helvetica', 'normal'); doc.setTextColor(51, 65, 85);
      const mechLines = doc.splitTextToSize(result.mechanism, usableW);
      doc.text(mechLines, margin, y); y += mechLines.length * 5 + 4;

      // Recommendations
      doc.setTextColor(30, 41, 59); doc.setFont('helvetica', 'bold'); doc.text('Clinical Recommendation', margin, y); y += 5;
      doc.setFont('helvetica', 'normal'); doc.setTextColor(51, 65, 85);
      const recLines = doc.splitTextToSize(result.recommendations, usableW);
      doc.text(recLines, margin, y); y += recLines.length * 5 + 6;

      // Pathway Diagram
      const canvas = await html2canvas(graphRef.current, { backgroundColor: '#020617', scale: 1.5 });
      const imgData = canvas.toDataURL('image/png');
      const imgH = (canvas.height / canvas.width) * usableW;
      doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59); doc.text('Interaction Pathway Diagram', margin, y); y += 5;
      doc.addImage(imgData, 'PNG', margin, y, usableW, Math.min(imgH, 80));
      y += Math.min(imgH, 80) + 6;

      // Footer disclaimer
      doc.setFontSize(8); doc.setTextColor(148, 163, 184); doc.setFont('helvetica', 'italic');
      doc.text('Disclaimer: This report is AI-generated and intended to assist, not replace, clinical judgment. Always verify with a licensed pharmacist or physician.', margin, 290);

      doc.save(`MedCascade_Report_${Date.now()}.pdf`);
    } catch (e) {
      console.error('PDF export failed:', e);
    } finally {
      setExportingPdf(false);
    }
  };

  const openReferralModal = () => {
    setReferralNote('');
    setReferralModal(true);
  };

  const generateReferral = async () => {
    if (!result) return;
    setGeneratingReferral(true);
    try {
      const response = await axios.post<{ referral_note: string }>(`${API_URL}/api/generate-referral`, {
        drugs: result.drugs_analyzed,
        safety_label: result.safety_label,
        mechanism: result.mechanism,
        specialist_type: specialistType,
      });
      setReferralNote(response.data.referral_note);
    } catch (e) {
      setReferralNote('Failed to generate referral note. Please try again.');
    } finally {
      setGeneratingReferral(false);
    }
  };

  const copyReferral = () => {
    navigator.clipboard.writeText(referralNote);
  };

  const severityStyle = result ? SEVERITY_COLORS[result.safety_score] ?? SEVERITY_COLORS[3] : null;

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', backgroundColor: '#0f172a', color: '#f8fafc', overflow: 'hidden' }}>

      {/* ── Sidebar ── */}
      <div style={{ width: '380px', borderRight: '1px solid #1e293b', backgroundColor: '#0f172a', display: 'flex', flexDirection: 'column', zIndex: 10, overflowY: 'auto' }}>
        <div style={{ padding: '24px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Stethoscope color="#3b82f6" size={28} />
          <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>MedCascade<span style={{ color: '#3b82f6', fontSize: '0.875rem', verticalAlign: 'top', marginLeft: '4px' }}>v2</span></h1>
        </div>

        <div style={{ padding: '24px', flex: 1 }}>
          <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>Patient Regimen</h2>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
            <input
              type="text"
              style={{ flex: 1, backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '8px 16px', color: '#f8fafc', outline: 'none' }}
              placeholder="Add medication..."
              value={newDrug}
              onChange={(e) => setNewDrug(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addDrug()}
            />
            <button onClick={addDrug} style={{ backgroundColor: '#2563eb', color: 'white', border: 'none', padding: '8px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={20} />
            </button>
          </div>

          <ul style={{ listStyle: 'none', padding: 0, margin: 0, marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {drugs.map(drug => (
              <li key={drug} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '12px 16px' }}>
                <span style={{ fontWeight: 500 }}>{drug}</span>
                <button onClick={() => removeDrug(drug)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                  <Trash2 size={18} />
                </button>
              </li>
            ))}
            {drugs.length === 0 && (
              <li style={{ textAlign: 'center', color: '#64748b', fontSize: '0.875rem', padding: '16px 0', fontStyle: 'italic' }}>No medications added.</li>
            )}
          </ul>

          <button
            onClick={() => analyze()}
            disabled={loading || drugs.length === 0}
            style={{ width: '100%', backgroundColor: loading || drugs.length === 0 ? '#334155' : '#4f46e5', color: loading || drugs.length === 0 ? '#94a3b8' : 'white', border: 'none', fontWeight: 500, padding: '12px 16px', borderRadius: '8px', cursor: loading || drugs.length === 0 ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
          >
            {loading ? <><Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing...</> : 'Analyze Multi-Drug Cascade'}
          </button>

          {/* ── Risk Assessment ── */}
          {result && severityStyle && (
            <div style={{ marginTop: '24px', padding: '20px', backgroundColor: severityStyle.bg, border: `1px solid ${severityStyle.border}`, borderRadius: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle color={severityStyle.badge} size={18} />
                  <span style={{ fontWeight: 700, color: severityStyle.text, fontSize: '0.95rem' }}>{result.safety_label}</span>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Score {result.safety_score}/5</span>
              </div>

              <p style={{ color: '#cbd5e1', fontSize: '0.85rem', lineHeight: 1.6, margin: '0 0 12px 0' }}>{result.summary}</p>

              {result.mechanism && (
                <div style={{ marginBottom: '12px' }}>
                  <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px 0' }}>⚗ Biological Mechanism</p>
                  <p style={{ color: '#cbd5e1', fontSize: '0.82rem', lineHeight: 1.6, margin: 0 }}>{result.mechanism}</p>
                </div>
              )}

              {result.recommendations && (
                <div>
                  <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px 0' }}>✦ Clinical Recommendation</p>
                  <p style={{ color: '#cbd5e1', fontSize: '0.82rem', lineHeight: 1.6, margin: 0 }}>{result.recommendations}</p>
                </div>
              )}
            </div>
          )}

          {/* ── Smart Swap Panel ── */}
          {result && result.alternatives && result.alternatives.length > 0 && (
            <div style={{ marginTop: '16px', padding: '20px', backgroundColor: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Sparkles size={16} color="#6ee7b7" />
                <span style={{ fontWeight: 700, color: '#6ee7b7', fontSize: '0.9rem' }}>Safer Alternatives</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {result.alternatives.map((alt, i) => (
                  <div key={i} style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)', border: '1px solid #1e293b', borderRadius: '8px', padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                      <span style={{ backgroundColor: '#ef4444', color: 'white', borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', fontWeight: 600 }}>{alt.original_drug}</span>
                      <ArrowRight size={14} color="#94a3b8" />
                      <span style={{ backgroundColor: '#10b981', color: 'white', borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', fontWeight: 600 }}>{alt.suggested_drug}</span>
                    </div>
                    <p style={{ color: '#94a3b8', fontSize: '0.78rem', lineHeight: 1.5, margin: '0 0 10px 0' }}>{alt.reason}</p>
                    <button
                      onClick={() => swapAndReanalyze(alt.original_drug, alt.suggested_drug)}
                      disabled={loading}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#065f46', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '6px', padding: '6px 12px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', width: '100%', justifyContent: 'center' }}
                    >
                      <RefreshCw size={13} /> Swap & Re-analyze
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Export Buttons ── */}
          {result && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button
                onClick={exportPDF}
                disabled={exportingPdf}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', backgroundColor: '#1e293b', color: '#cbd5e1', border: '1px solid #334155', borderRadius: '8px', padding: '10px', fontSize: '0.82rem', fontWeight: 500, cursor: 'pointer' }}
              >
                {exportingPdf ? <Loader2 size={14} /> : <Download size={14} />} Export PDF
              </button>
              <button
                onClick={openReferralModal}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', backgroundColor: '#1e293b', color: '#cbd5e1', border: '1px solid #334155', borderRadius: '8px', padding: '10px', fontSize: '0.82rem', fontWeight: 500, cursor: 'pointer' }}
              >
                <FileText size={14} /> Draft Referral
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Main Graph Area ── */}
      <div ref={graphRef} style={{ flex: 1, position: 'relative', backgroundColor: '#020617' }}>
        {!nodes.length && !loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', zIndex: 0 }}>
            <p style={{ fontSize: '1.125rem' }}>Add medications and click Analyze to visualize cascading interactions.</p>
          </div>
        )}
        <div style={{ width: '100%', height: '100%' }}>
          <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} fitView>
            <Background color="#1e293b" gap={16} />
            <Controls style={{ backgroundColor: '#1e293b', border: '1px solid #334155', fill: 'white' }} />
          </ReactFlow>
        </div>
      </div>

      {/* ── Referral Modal ── */}
      {referralModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px', padding: '28px', width: '560px', maxHeight: '85vh', overflowY: 'auto', position: 'relative' }}>
            <button onClick={() => setReferralModal(false)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
              <X size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <FileText color="#3b82f6" size={22} />
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Draft Specialist Referral</h2>
            </div>

            <label style={{ fontSize: '0.82rem', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Referring to Specialist</label>
            <select
              value={specialistType}
              onChange={e => setSpecialistType(e.target.value)}
              style={{ width: '100%', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '8px 12px', color: '#f8fafc', marginBottom: '16px', outline: 'none', fontSize: '0.9rem' }}
            >
              {['Hematology', 'Cardiology', 'Nephrology', 'Clinical Pharmacology', 'Internal Medicine'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <button
              onClick={generateReferral}
              disabled={generatingReferral}
              style={{ width: '100%', backgroundColor: '#4f46e5', color: 'white', border: 'none', borderRadius: '8px', padding: '10px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '16px' }}
            >
              {generatingReferral ? <><Loader2 size={16} /> Generating...</> : <><Sparkles size={16} /> Generate Note</>}
            </button>

            {referralNote && (
              <>
                <textarea
                  value={referralNote}
                  onChange={e => setReferralNote(e.target.value)}
                  rows={10}
                  style={{ width: '100%', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '12px', color: '#cbd5e1', fontSize: '0.85rem', lineHeight: 1.7, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                />
                <button
                  onClick={copyReferral}
                  style={{ marginTop: '10px', width: '100%', backgroundColor: '#1e293b', color: '#cbd5e1', border: '1px solid #334155', borderRadius: '8px', padding: '10px', fontWeight: 500, cursor: 'pointer', fontSize: '0.85rem' }}
                >
                  Copy to Clipboard
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
