import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';

/**
 * Build a markdown summary of dashboard data for AI analysis.
 */
export function buildMarkdownSummary({ title, period, stats, failureAnalysis, departmentStats, categoryStats }) {
  let md = `# ${title}\n`;
  md += `**Period:** ${period}\n\n`;

  // KPI Summary
  md += `## KPI Summary\n`;
  md += `| Metric | Value |\n|---|---|\n`;
  md += `| Total Plans | ${stats.total} |\n`;
  md += `| Achieved | ${stats.achieved} |\n`;
  md += `| In Progress | ${stats.inProgress} |\n`;
  md += `| Open | ${stats.pending || stats.open || 0} |\n`;
  md += `| Not Achieved | ${stats.notAchieved} |\n`;
  md += `| Completion Rate | ${stats.completionRate?.toFixed(1) || 0}% |\n`;
  if (stats.qualityScore != null) {
    md += `| Avg Verification Score | ${stats.qualityScore?.toFixed(1)} |\n`;
  }
  md += `\n`;

  // Department breakdown (if available)
  if (departmentStats?.length > 0) {
    md += `## Department Performance\n`;
    md += `| Department | Total | Achieved | Completion Rate | Avg Score |\n|---|---|---|---|---|\n`;
    departmentStats.forEach(d => {
      md += `| ${d.name || d.code} | ${d.total} | ${d.achieved} | ${d.completion?.toFixed(1)}% | ${d.score?.toFixed(1) || '-'} |\n`;
    });
    md += `\n`;
  }

  // Category/Priority breakdown (if available)
  if (categoryStats?.length > 0) {
    md += `## Priority Breakdown\n`;
    md += `| Priority | Total | Achieved | Completion Rate | Avg Score |\n|---|---|---|---|---|\n`;
    categoryStats.forEach(c => {
      md += `| ${c.name} | ${c.volume} | ${c.achieved} | ${c.completionRate?.toFixed(1)}% | ${c.avgScore?.toFixed(1) || '-'} |\n`;
    });
    md += `\n`;
  }

  // Failure analysis
  if (failureAnalysis?.reasons?.length > 0) {
    md += `## Failure Analysis (Not Achieved: ${failureAnalysis.totalFailed})\n`;
    md += `| Reason | Count | Percentage |\n|---|---|---|\n`;
    failureAnalysis.reasons.forEach(r => {
      md += `| ${r.reason} | ${r.count} | ${r.percentage}% |\n`;
    });
    md += `\n`;
  }

  md += `---\n*Exported from Werkudara Group Action Plan Tracker on ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}*\n`;

  return md;
}

/**
 * Export dashboard data as Excel file.
 */
export function exportDashboardExcel({ title, period, stats, failureAnalysis, departmentStats, categoryStats, plans }) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: KPI Summary
  const kpiData = [
    ['Metric', 'Value'],
    ['Period', period],
    ['Total Plans', stats.total],
    ['Achieved', stats.achieved],
    ['In Progress', stats.inProgress],
    ['Open', stats.pending || stats.open || 0],
    ['Not Achieved', stats.notAchieved],
    ['Completion Rate (%)', stats.completionRate?.toFixed(1) || 0],
    ['Avg Verification Score', stats.qualityScore?.toFixed(1) || 'N/A'],
  ];
  const kpiSheet = XLSX.utils.aoa_to_sheet(kpiData);
  kpiSheet['!cols'] = [{ wch: 25 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, kpiSheet, 'KPI Summary');

  // Sheet 2: Department Performance (if available)
  if (departmentStats?.length > 0) {
    const deptData = [
      ['Department', 'Code', 'Total', 'Achieved', 'Completion Rate (%)', 'Avg Score'],
      ...departmentStats.map(d => [
        d.name || d.code, d.code, d.total, d.achieved,
        d.completion?.toFixed(1), d.score?.toFixed(1) || ''
      ])
    ];
    const deptSheet = XLSX.utils.aoa_to_sheet(deptData);
    deptSheet['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 18 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, deptSheet, 'Department Performance');
  }

  // Sheet 3: Priority Breakdown (if available)
  if (categoryStats?.length > 0) {
    const catData = [
      ['Priority', 'Total', 'Achieved', 'Completion Rate (%)', 'Avg Score'],
      ...categoryStats.map(c => [
        c.name, c.volume, c.achieved, c.completionRate?.toFixed(1), c.avgScore?.toFixed(1) || ''
      ])
    ];
    const catSheet = XLSX.utils.aoa_to_sheet(catData);
    XLSX.utils.book_append_sheet(wb, catSheet, 'Priority Breakdown');
  }

  // Sheet 4: Failure Analysis
  if (failureAnalysis?.reasons?.length > 0) {
    const failData = [
      ['Reason', 'Count', 'Percentage (%)'],
      ...failureAnalysis.reasons.map(r => [r.reason, r.count, r.percentage])
    ];
    const failSheet = XLSX.utils.aoa_to_sheet(failData);
    XLSX.utils.book_append_sheet(wb, failSheet, 'Failure Analysis');
  }

  // Sheet 5: Raw Plan Data
  if (plans?.length > 0) {
    const planData = [
      ['Month', 'Department', 'Category', 'Goal/Strategy', 'Action Plan', 'Indicator', 'Status', 'Score', 'Max Score'],
      ...plans.map(p => [
        p.month, p.department_code, p.category || '', p.goal_strategy, p.action_plan,
        p.indicator, p.status, p.quality_score ?? '', p.max_possible_score ?? 100
      ])
    ];
    const planSheet = XLSX.utils.aoa_to_sheet(planData);
    planSheet['!cols'] = [{ wch: 6 }, { wch: 10 }, { wch: 8 }, { wch: 30 }, { wch: 35 }, { wch: 25 }, { wch: 14 }, { wch: 6 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, planSheet, 'Plan Data');
  }

  const filename = `Dashboard_${title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * Export dashboard data as JSON file.
 */
export function exportDashboardJSON({ title, period, stats, failureAnalysis, departmentStats, categoryStats, plans }) {
  const data = {
    exportedAt: new Date().toISOString(),
    title,
    period,
    kpiSummary: {
      totalPlans: stats.total,
      achieved: stats.achieved,
      inProgress: stats.inProgress,
      open: stats.pending || stats.open || 0,
      notAchieved: stats.notAchieved,
      completionRate: stats.completionRate,
      avgVerificationScore: stats.qualityScore,
    },
    departmentPerformance: departmentStats?.map(d => ({
      code: d.code, name: d.name || d.code,
      total: d.total, achieved: d.achieved,
      completionRate: d.completion, avgScore: d.score,
    })) || [],
    categoryBreakdown: categoryStats?.map(c => ({
      name: c.name, total: c.volume, achieved: c.achieved,
      completionRate: c.completionRate, avgScore: c.avgScore,
    })) || [],
    failureAnalysis: {
      totalFailed: failureAnalysis?.totalFailed || 0,
      reasons: failureAnalysis?.reasons || [],
    },
    plans: plans?.map(p => ({
      month: p.month, department: p.department_code, category: p.category,
      goalStrategy: p.goal_strategy, actionPlan: p.action_plan,
      indicator: p.indicator, status: p.status,
      score: p.quality_score, maxScore: p.max_possible_score,
    })) || [],
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Dashboard_${title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Export dashboard as PDF with smart page-breaking per widget section.
 * Captures each top-level section separately and places them on pages
 * without cutting through widgets.
 */
export async function exportDashboardPDF(elementId, title) {
  const element = document.getElementById(elementId);
  if (!element) return;

  const { toPng } = await import('html-to-image');

  // A4 landscape dimensions
  const pdf = new jsPDF('l', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const usableWidth = pageWidth - 2 * margin;
  const usableHeight = pageHeight - 2 * margin - 8; // Reserve 8mm for footer

  // Get all direct child sections (each is a widget row/group)
  const sections = Array.from(element.children).filter(
    (el) => el.offsetHeight > 0 && el.tagName !== 'SCRIPT'
  );

  if (sections.length === 0) return;

  // Temporarily expand all scrollable/clipped widgets to show full content
  const overflowResets = [];
  element.querySelectorAll('*').forEach((el) => {
    const style = getComputedStyle(el);
    const hasOverflow = style.overflow !== 'visible' && style.overflow !== '' &&
      (style.overflow === 'hidden' || style.overflow === 'auto' || style.overflow === 'scroll' ||
       style.overflowY === 'hidden' || style.overflowY === 'auto' || style.overflowY === 'scroll');
    const hasFixedHeight = el.style.height || el.style.maxHeight ||
      el.className?.includes?.('h-[') || el.className?.includes?.('max-h-');

    if (hasOverflow || hasFixedHeight) {
      overflowResets.push({
        el,
        overflow: el.style.overflow,
        overflowY: el.style.overflowY,
        height: el.style.height,
        maxHeight: el.style.maxHeight,
      });
      el.style.overflow = 'visible';
      el.style.overflowY = 'visible';
      el.style.height = 'auto';
      el.style.maxHeight = 'none';
    }
  });

  // Capture each section as a separate image
  const capturedSections = [];
  for (const section of sections) {
    try {
      const imgData = await toPng(section, {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: '#f9fafb',
        filter: (node) => node.tagName !== 'SCRIPT' && node.tagName !== 'NOSCRIPT',
      });

      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imgData;
      });

      // Scale to fit page width
      const scale = usableWidth / img.naturalWidth;
      const scaledHeight = img.naturalHeight * scale;

      capturedSections.push({ imgData, img, scaledHeight });
    } catch (err) {
      console.warn('[PDF Export] Failed to capture section:', err);
    }
  }

  // Restore original overflow/height styles
  overflowResets.forEach(({ el, overflow, overflowY, height, maxHeight }) => {
    el.style.overflow = overflow;
    el.style.overflowY = overflowY;
    el.style.height = height;
    el.style.maxHeight = maxHeight;
  });

  // Place sections on pages with smart page-breaking
  let currentY = margin;
  let isFirstPage = true;

  for (let i = 0; i < capturedSections.length; i++) {
    const { img, scaledHeight } = capturedSections[i];
    const sectionHeight = scaledHeight;

    // Check if this section fits on the current page
    if (!isFirstPage || i > 0) {
      if (currentY + sectionHeight > margin + usableHeight) {
        // Doesn't fit — start a new page
        pdf.addPage();
        currentY = margin;
      }
    }

    // If a single section is taller than a full page, split it
    if (sectionHeight > usableHeight) {
      const scale = usableWidth / img.naturalWidth;
      let remainingHeight = img.naturalHeight;
      let sourceY = 0;

      while (remainingHeight > 0) {
        if (sourceY > 0) {
          pdf.addPage();
          currentY = margin;
        }

        const sliceH = Math.min(remainingHeight, usableHeight / scale);
        const destH = sliceH * scale;

        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = img.naturalWidth;
        pageCanvas.height = sliceH;
        const ctx = pageCanvas.getContext('2d');
        ctx.drawImage(img, 0, sourceY, img.naturalWidth, sliceH, 0, 0, img.naturalWidth, sliceH);

        const sliceData = pageCanvas.toDataURL('image/png');
        pdf.addImage(sliceData, 'PNG', margin, currentY, usableWidth, destH);

        currentY += destH + 3;
        sourceY += sliceH;
        remainingHeight -= sliceH;
      }
    } else {
      // Section fits — draw it
      pdf.addImage(img.src, 'PNG', margin, currentY, usableWidth, sectionHeight);
      currentY += sectionHeight + 3; // 3mm gap between sections
    }

    // Add footer on first page
    if (isFirstPage && i === 0) {
      pdf.setFontSize(7);
      pdf.setTextColor(170);
      pdf.text(
        `${title} — Exported ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`,
        margin,
        pageHeight - 5
      );
      isFirstPage = false;
    }
  }

  pdf.save(`Dashboard_${title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
