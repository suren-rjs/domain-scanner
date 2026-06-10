const ExcelJS = require('exceljs');
const path = require('path');

/**
 * Generates a styled Excel report for the domain scan.
 * 
 * @param {string} domain - The base domain scanned.
 * @param {Array<Object>} subdomainsData - Subdomain statuses.
 * @param {Array<Object>} blogArticlesData - Discovered blog/article URLs.
 * @param {Array<Object>} technologiesData - Identified technologies and pages.
 * @param {string} outputPath - Filename or absolute path for the final Excel file.
 * @returns {Promise<void>}
 */
async function generateExcelReport(domain, subdomainsData, blogArticlesData, technologiesData, outputPath) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Domain Scanner CLI';
  workbook.created = new Date();

  // Color Palette - Sleek Slate/Blue theme
  const colors = {
    primary: '1E293B',    // Slate 800
    primaryLight: 'F1F5F9', // Slate 100
    accent: '3B82F6',     // Blue 500
    accentLight: 'EFF6FF', // Blue 50
    textLight: 'FFFFFF',
    textDark: '0F172A',
    border: 'CBD5E1',     // Slate 300
    success: '10B981',    // Emerald 500
    danger: 'EF4444',     // Red 500
  };

  // Border Style
  const thinBorder = {
    top: { style: 'thin', color: { argb: colors.border } },
    left: { style: 'thin', color: { argb: colors.border } },
    bottom: { style: 'thin', color: { argb: colors.border } },
    right: { style: 'thin', color: { argb: colors.border } },
  };

  // Font Style
  const headerFont = { name: 'Segoe UI', size: 11, bold: true, color: { argb: colors.textLight } };
  const titleFont = { name: 'Segoe UI', size: 16, bold: true, color: { argb: colors.textDark } };
  const cellFont = { name: 'Segoe UI', size: 10 };
  const boldCellFont = { name: 'Segoe UI', size: 10, bold: true };

  // ==========================================
  // TAB 1: Subdomains
  // ==========================================
  const wsSubdomains = workbook.addWorksheet('Subdomains');
  wsSubdomains.views = [{ showGridLines: true }];

  // Title block
  wsSubdomains.mergeCells('A1:D1');
  const titleRow1 = wsSubdomains.getCell('A1');
  titleRow1.value = `Subdomain Scan Results for ${domain}`;
  titleRow1.font = titleFont;
  wsSubdomains.getRow(1).height = 30;

  wsSubdomains.getCell('A2').value = `Total Subdomains Found: ${subdomainsData.length}`;
  wsSubdomains.getCell('A2').font = boldCellFont;
  wsSubdomains.getRow(2).height = 20;

  // Table Headers
  const headersTab1 = ['Subdomain', 'Status', 'Response Code', 'Scan Error / Note'];
  wsSubdomains.getRow(4).values = headersTab1;
  wsSubdomains.getRow(4).height = 25;

  headersTab1.forEach((_, colIndex) => {
    const cell = wsSubdomains.getCell(4, colIndex + 1);
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: colors.primary }
    };
    cell.font = headerFont;
    cell.alignment = { vertical: 'middle', horizontal: colIndex === 0 ? 'left' : 'center' };
  });

  // Populate Subdomains Data
  subdomainsData.forEach((sub, idx) => {
    const rowIndex = idx + 5;
    const row = wsSubdomains.getRow(rowIndex);
    row.values = [
      sub.subdomain,
      sub.success ? 'Active' : 'Inactive / Timeout',
      sub.status || '-',
      sub.error || '-'
    ];
    row.height = 20;

    // Apply fonts & borders
    for (let c = 1; c <= 4; c++) {
      const cell = wsSubdomains.getCell(rowIndex, c);
      cell.font = cellFont;
      cell.border = thinBorder;
      
      // Alignments & conditional formatting
      if (c === 1) {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      } else if (c === 2) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.font = boldCellFont;
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: sub.success ? 'D1FAE5' : 'FEE2E2' } // soft green or soft red
        };
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: sub.success ? '065F46' : '991B1B' } };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
    }
  });

  // Auto-fit Column Widths
  const autofitColumns = (ws) => {
    ws.columns.forEach((column) => {
      let maxLen = 0;
      column.eachCell({ includeEmpty: true }, (cell) => {
        // Skip title row and summary info for length checks
        if (cell.row > 3 && cell.value) {
          const len = cell.value.toString().length;
          if (len > maxLen) maxLen = len;
        }
      });
      column.width = Math.max(maxLen + 4, 15);
    });
  };
  autofitColumns(wsSubdomains);


  // ==========================================
  // TAB 2: Blogs and Articles
  // ==========================================
  const wsBlogs = workbook.addWorksheet('Blogs & Articles');
  wsBlogs.views = [{ showGridLines: true }];

  // Title block
  wsBlogs.mergeCells('A1:C1');
  const titleRow2 = wsBlogs.getCell('A1');
  titleRow2.value = `Blog & Article Links Found`;
  titleRow2.font = titleFont;
  wsBlogs.getRow(1).height = 30;

  // Total count indicator card style
  wsBlogs.getCell('A2').value = `Total Articles/Blogs:`;
  wsBlogs.getCell('A2').font = cellFont;
  wsBlogs.getCell('B2').value = blogArticlesData.length;
  wsBlogs.getCell('B2').font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: colors.accent } };
  wsBlogs.getRow(2).height = 20;

  // Table Headers
  const headersTab2 = ['No.', 'Blog / Article URL', 'Main Subdomain Source'];
  wsBlogs.getRow(4).values = headersTab2;
  wsBlogs.getRow(4).height = 25;

  headersTab2.forEach((_, colIndex) => {
    const cell = wsBlogs.getCell(4, colIndex + 1);
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: colors.primary }
    };
    cell.font = headerFont;
    cell.alignment = { vertical: 'middle', horizontal: colIndex === 0 ? 'center' : 'left' };
  });

  // Populate Blogs Data
  blogArticlesData.forEach((item, idx) => {
    const rowIndex = idx + 5;
    const row = wsBlogs.getRow(rowIndex);
    row.values = [
      idx + 1,
      item.url,
      item.source
    ];
    row.height = 20;

    for (let c = 1; c <= 3; c++) {
      const cell = wsBlogs.getCell(rowIndex, c);
      cell.font = cellFont;
      cell.border = thinBorder;
      cell.alignment = { vertical: 'middle', horizontal: c === 1 ? 'center' : 'left' };
      if (c === 2) {
        // Style URLs nicely
        cell.font = { name: 'Segoe UI', size: 10, color: { argb: '2563EB' }, underline: true };
      }
    }
  });
  autofitColumns(wsBlogs);


  // ==========================================
  // TAB 3: Technologies Used
  // ==========================================
  const wsTech = workbook.addWorksheet('Technologies Used');
  wsTech.views = [{ showGridLines: true }];

  // Title block
  wsTech.mergeCells('A1:D1');
  const titleRow3 = wsTech.getCell('A1');
  titleRow3.value = `Technologies Detected on Domain`;
  titleRow3.font = titleFont;
  wsTech.getRow(1).height = 30;

  wsTech.getCell('A2').value = `Unique Technologies: ${technologiesData.length}`;
  wsTech.getCell('A2').font = boldCellFont;
  wsTech.getRow(2).height = 20;

  // Table Headers
  const headersTab3 = ['Category', 'Technology Name', 'Detected On Page(s)', 'Occurrences'];
  wsTech.getRow(4).values = headersTab3;
  wsTech.getRow(4).height = 25;

  headersTab3.forEach((_, colIndex) => {
    const cell = wsTech.getCell(4, colIndex + 1);
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: colors.primary }
    };
    cell.font = headerFont;
    cell.alignment = { vertical: 'middle', horizontal: colIndex === 3 ? 'center' : 'left' };
  });

  // Populate Technologies Data
  technologiesData.forEach((tech, idx) => {
    const rowIndex = idx + 5;
    const row = wsTech.getRow(rowIndex);
    row.values = [
      tech.category || 'Other',
      tech.name,
      tech.pages.join(', '),
      tech.pages.length
    ];
    row.height = 20;

    for (let c = 1; c <= 4; c++) {
      const cell = wsTech.getCell(rowIndex, c);
      cell.font = cellFont;
      cell.border = thinBorder;
      cell.alignment = { vertical: 'middle', horizontal: c === 4 ? 'center' : 'left' };
      if (c === 1) {
        cell.font = boldCellFont;
      }
    }
  });
  autofitColumns(wsTech);

  // Write file
  await workbook.xlsx.writeFile(outputPath);
}

module.exports = { generateExcelReport };
