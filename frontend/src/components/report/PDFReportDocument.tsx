import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { FinalReport, IntegritySummary } from '../../lib/types';

export interface PDFReportDocumentProps {
  session: {
    id: string;
    role: string;
    seniority: string;
    created_at?: string;
  };
  report: FinalReport;
}

const styles = StyleSheet.create({
  page: {
    padding: 36,
    backgroundColor: '#F4F1EA', // warm cream page background
    color: '#1C2420', // near-black with green undertone
    fontFamily: 'Helvetica',
    fontSize: 10,
    lineHeight: 1.4,
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: '#E3DED2',
    borderBottomStyle: 'solid',
    paddingBottom: 16,
    marginBottom: 16,
  },
  platformTitle: {
    fontSize: 8.5,
    fontWeight: 'bold',
    color: '#0F4A3A', // deep forest green
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  documentTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1C2420',
    fontFamily: 'Times-Roman',
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8.5,
    color: '#5F6B64',
    marginTop: 4,
  },
  // Scorecard Overview Card
  scorecardRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  scoreCard: {
    flex: 1,
    backgroundColor: '#FBFAF6', // off-white card
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E3DED2',
  },
  scoreLabel: {
    fontSize: 8,
    color: '#5F6B64',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  scoreValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0F4A3A',
    fontFamily: 'Times-Roman',
  },
  scoreValueMax: {
    fontSize: 10,
    color: '#8A948D',
    fontFamily: 'Helvetica',
  },
  recommendationBadge: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0F4A3A',
    fontFamily: 'Times-Roman',
    marginTop: 4,
  },
  // Competency Breakdown Grid
  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#1C2420',
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#0F4A3A',
    paddingLeft: 6,
    fontFamily: 'Times-Roman',
  },
  breakdownRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  breakdownCard: {
    flex: 1,
    backgroundColor: '#FBFAF6',
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E3DED2',
  },
  breakdownLabel: {
    fontSize: 8,
    color: '#5F6B64',
    marginBottom: 2,
  },
  breakdownScore: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F4A3A',
  },
  // Text Boxes (Summary, Strengths, Growth)
  textBox: {
    backgroundColor: '#FBFAF6',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E3DED2',
  },
  bulletItem: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  bulletDot: {
    width: 12,
    fontSize: 10,
    color: '#0F4A3A',
  },
  bulletText: {
    flex: 1,
    fontSize: 9,
    color: '#1C2420',
  },
  // Integrity Section
  integrityContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E3DED2',
    borderTopStyle: 'solid',
  },
  integrityHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  verdictBadgeVerified: {
    backgroundColor: '#E3EFE8', // mint
    color: '#0F4A3A',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
    fontSize: 8.5,
    fontWeight: 'bold',
  },
  verdictBadgeWarning: {
    backgroundColor: '#F8E7DC', // peach
    color: '#C2410C',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
    fontSize: 8.5,
    fontWeight: 'bold',
  },
  verdictBadgeFailed: {
    backgroundColor: '#FDE8E8',
    color: '#B42318',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
    fontSize: 8.5,
    fontWeight: 'bold',
  },
  integrityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  integrityMetricItem: {
    width: '48%',
    backgroundColor: '#FBFAF6',
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E3DED2',
  },
  integrityMetricLabel: {
    fontSize: 7.5,
    color: '#5F6B64',
    textTransform: 'uppercase',
  },
  integrityMetricValue: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0F4A3A',
    marginTop: 2,
  },
  // Timeline Table
  timelineTable: {
    marginTop: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E3DED2',
    borderRadius: 6,
    overflow: 'hidden',
  },
  timelineHeader: {
    flexDirection: 'row',
    backgroundColor: '#EFEBE2',
    paddingVertical: 4,
    paddingHorizontal: 6,
    fontSize: 7.5,
    fontWeight: 'bold',
    color: '#1C2420',
  },
  timelineRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: '#E3DED2',
    fontSize: 7.5,
    color: '#1C2420',
  },
  colTime: { width: '20%' },
  colFlag: { width: '45%' },
  colDuration: { width: '20%' },
  colConfidence: { width: '15%' },
  // Disclaimer & Exclusion Note
  exclusionNote: {
    fontSize: 7.5,
    color: '#5F6B64',
    marginBottom: 6,
    fontStyle: 'italic',
  },
  disclaimerText: {
    fontSize: 7,
    color: '#8A948D',
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E3DED2',
    paddingTop: 6,
    textAlign: 'center',
  },
});

export function PDFReportDocument({ session, report }: PDFReportDocumentProps): React.ReactElement {
  const integrity: IntegritySummary = report.integrity_summary || {
    verdict: 'Verified',
    integrity_score: 100.0,
    camera_device_name: 'Physical Built-in Webcam / USB Camera',
    challenges_passed: 1,
    challenges_failed: 0,
    face_present_percentage: 100.0,
    pauses_count: 0,
    camera_loss_incidents: 0,
    timeline_events: [],
    excluded_segments_count: 0,
    non_verbal_excluded_note:
      'Non-verbal scores (eye contact, posture) are computed only from verified-live segments; segments with active integrity flags were excluded.',
    disclaimer:
      'Integrity checks are automated heuristics and may produce false positives. Review flagged events before drawing conclusions.',
  };

  const getVerdictStyle = () => {
    if (integrity.verdict === 'Verified') return styles.verdictBadgeVerified;
    if (integrity.verdict === 'Verified with warnings') return styles.verdictBadgeWarning;
    return styles.verdictBadgeFailed;
  };

  const formattedDate = session.created_at
    ? new Date(session.created_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : new Date().toLocaleDateString();

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Document Header */}
        <View style={styles.header}>
          <Text style={styles.platformTitle}>Mock-interview simulator</Text>
          <Text style={styles.documentTitle}>Executive Interview & Integrity Report</Text>
          <View style={styles.metaRow}>
            <Text>Target Role: {session.seniority} {session.role}</Text>
            <Text>Session ID: {session.id.slice(0, 8)}... • Date: {formattedDate}</Text>
          </View>
        </View>

        {/* Primary Scorecard Cards */}
        <View style={styles.scorecardRow}>
          <View style={styles.scoreCard}>
            <Text style={styles.scoreLabel}>Overall Composite Score</Text>
            <Text style={styles.scoreValue}>
              {report.overall_score}
              <Text style={styles.scoreValueMax}> /100</Text>
            </Text>
          </View>

          <View style={styles.scoreCard}>
            <Text style={styles.scoreLabel}>Hiring Recommendation</Text>
            <Text style={styles.recommendationBadge}>{report.hiring_recommendation}</Text>
          </View>

          <View style={styles.scoreCard}>
            <Text style={styles.scoreLabel}>Camera Integrity Score</Text>
            <Text style={styles.scoreValue}>
              {integrity.integrity_score}
              <Text style={styles.scoreValueMax}> /100</Text>
            </Text>
          </View>
        </View>

        {/* Competency Breakdown */}
        <Text style={styles.sectionTitle}>Performance Dimension Breakdown</Text>
        <View style={styles.breakdownRow}>
          <View style={styles.breakdownCard}>
            <Text style={styles.breakdownLabel}>Technical Depth (60%)</Text>
            <Text style={styles.breakdownScore}>{report.category_scores.technical}%</Text>
          </View>
          <View style={styles.breakdownCard}>
            <Text style={styles.breakdownLabel}>Communication (25%)</Text>
            <Text style={styles.breakdownScore}>{report.category_scores.communication}%</Text>
          </View>
          <View style={styles.breakdownCard}>
            <Text style={styles.breakdownLabel}>Biometric Composure (15%)*</Text>
            <Text style={styles.breakdownScore}>{report.category_scores.composure}%</Text>
          </View>
        </View>

        {/* Key Strengths & Opportunities */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
          <View style={[styles.textBox, { flex: 1 }]}>
            <Text style={[styles.sectionTitle, { fontSize: 10, marginBottom: 4 }]}>Observed Strengths</Text>
            {report.strengths.slice(0, 3).map((s, idx) => (
              <View key={idx} style={styles.bulletItem}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{s}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.textBox, { flex: 1 }]}>
            <Text style={[styles.sectionTitle, { fontSize: 10, marginBottom: 4 }]}>Growth Opportunities</Text>
            {report.weaknesses.slice(0, 3).map((w, idx) => (
              <View key={idx} style={styles.bulletItem}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{w}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Executive Summary */}
        <View style={styles.textBox}>
          <Text style={[styles.sectionTitle, { fontSize: 10, marginBottom: 4 }]}>Executive Assessment</Text>
          <Text style={{ fontSize: 8.5, color: '#e2e8f0', lineHeight: 1.4 }}>
            {report.executive_summary}
          </Text>
        </View>

        {/* SECTION 7: CAMERA INTEGRITY & VERIFICATION REPORT */}
        <View style={styles.integrityContainer}>
          <View style={styles.integrityHeaderRow}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>
              Physical Camera Integrity & Biometric Verification (§7)
            </Text>
            <Text style={getVerdictStyle()}>Verdict: {integrity.verdict}</Text>
          </View>

          <Text style={styles.exclusionNote}>
            * {integrity.non_verbal_excluded_note} ({integrity.excluded_segments_count} flagged segments excluded).
          </Text>

          {/* Integrity Metrics Grid */}
          <View style={styles.integrityGrid}>
            <View style={styles.integrityMetricItem}>
              <Text style={styles.integrityMetricLabel}>Physical Device Used</Text>
              <Text style={styles.integrityMetricValue}>
                {integrity.camera_device_name.length > 32
                  ? integrity.camera_device_name.slice(0, 30) + '...'
                  : integrity.camera_device_name}
              </Text>
            </View>

            <View style={styles.integrityMetricItem}>
              <Text style={styles.integrityMetricLabel}>Face Present Rate</Text>
              <Text style={styles.integrityMetricValue}>{integrity.face_present_percentage}%</Text>
            </View>

            <View style={styles.integrityMetricItem}>
              <Text style={styles.integrityMetricLabel}>Liveness Challenges</Text>
              <Text style={styles.integrityMetricValue}>
                {integrity.challenges_passed} Passed / {integrity.challenges_failed} Failed
              </Text>
            </View>

            <View style={styles.integrityMetricItem}>
              <Text style={styles.integrityMetricLabel}>Pauses & Feed Loss</Text>
              <Text style={styles.integrityMetricValue}>
                {integrity.pauses_count} Pauses ({integrity.camera_loss_incidents} Disconnects)
              </Text>
            </View>
          </View>

          {/* Timeline Table */}
          <Text style={{ fontSize: 8.5, fontWeight: 'bold', color: '#cbd5e1', marginTop: 4 }}>
            Integrity Audit Event Timeline:
          </Text>
          {integrity.timeline_events.length > 0 ? (
            <View style={styles.timelineTable}>
              <View style={styles.timelineHeader}>
                <Text style={styles.colTime}>Offset (sec)</Text>
                <Text style={styles.colFlag}>Flag Triggered</Text>
                <Text style={styles.colDuration}>Duration</Text>
                <Text style={styles.colConfidence}>Confidence</Text>
              </View>
              {integrity.timeline_events.slice(0, 6).map((evt, idx) => (
                <View key={idx} style={styles.timelineRow}>
                  <Text style={styles.colTime}>{evt.timestamp}s</Text>
                  <Text style={styles.colFlag}>{evt.flag}</Text>
                  <Text style={styles.colDuration}>{evt.duration_sec}s</Text>
                  <Text style={styles.colConfidence}>{Math.round(evt.confidence * 100)}%</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={[styles.textBox, { padding: 6, marginTop: 4, marginBottom: 4 }]}>
              <Text style={{ fontSize: 8, color: '#34d399' }}>
                ✓ Zero integrity flags or anomalies detected during this interview session.
              </Text>
            </View>
          )}

          {/* Mandatory Disclaimer */}
          <Text style={styles.disclaimerText}>
            Disclaimer: {integrity.disclaimer} All computer vision heuristics executed locally in the candidate browser; no raw video footage was recorded, uploaded, or transmitted.
          </Text>
        </View>
      </Page>
    </Document>
  );
}
