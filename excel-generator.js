const ExcelJS = require('exceljs');
const path = require('path');

/**
 * Categorizes a URL path into common web page sections.
 * 
 * @param {string} urlStr - The URL to categorize.
 * @returns {string} The matched page category name.
 */
function categorizeUrl(urlStr) {
  try {
    const urlObj = new URL(urlStr);
    const path = urlObj.pathname.toLowerCase();
    
    if (path.includes('/people/') || path.includes('/professionals/') || path.includes('/attorneys/') || path.includes('/biography/')) {
      return 'People';
    }
    if (path.includes('/news/') || path.includes('/press/') || path.includes('/press-releases/')) {
      return 'News';
    }
    if (path.includes('/events/') || path.includes('/webinars/') || path.includes('/seminars/')) {
      return 'Events';
    }
    if (path.includes('/blog/') || path.includes('/blogs/')) {
      return 'Blogs';
    }
    if (path.includes('/services/') || path.includes('/practices/') || path.includes('/capabilities/')) {
      return 'Services';
    }
    if (path.includes('/industries/') || path.includes('/sectors/')) {
      return 'Industries';
    }
    if (path.includes('/publications/') || path.includes('/articles/') || path.includes('/newsletters/')) {
      return 'Publications';
    }
    if (path.includes('/insights/') || path.includes('/thought-leadership/')) {
      return 'Insights';
    }
    if (path.includes('/about/') || path.includes('/about-us/') || path.includes('/our-firm/')) {
      return 'About Us';
    }
    if (path.includes('/client-stories/') || path.includes('/case-studies/') || path.includes('/testimonials/')) {
      return 'Client Stories';
    }
    if (path.includes('/careers/') || path.includes('/jobs/')) {
      return 'Careers';
    }
    if (path.includes('/offices/') || path.includes('/locations/') || path.includes('/contact/') || path.includes('/contact-us/')) {
      return 'Offices & Contacts';
    }
    
    // Check if it's the home page
    if (path === '/' || path === '') {
      return 'Home Page';
    }
    
    return 'General Information';
  } catch (e) {
    return 'General Information';
  }
}

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
  // TAB 1: Pages & Subdomains
  // ==========================================
  const wsSubdomains = workbook.addWorksheet('Pages & Subdomains');
  wsSubdomains.views = [{ showGridLines: true }];

  // Title block
  wsSubdomains.mergeCells('A1:D1');
  const titleRow1 = wsSubdomains.getCell('A1');
  titleRow1.value = `Page & Subdomain Scan Results for ${domain}`;
  titleRow1.font = titleFont;
  wsSubdomains.getRow(1).height = 30;

  wsSubdomains.getCell('A2').value = `Total Pages Scanned: ${subdomainsData.length}`;
  wsSubdomains.getCell('A2').font = boldCellFont;
  wsSubdomains.getRow(2).height = 20;

  // Table Headers
  const headersTab1 = ['URL / Page', 'Status', 'Response Code', 'Scan Error / Note'];
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

  // Populate Pages Data
  subdomainsData.forEach((page, idx) => {
    const rowIndex = idx + 5;
    const row = wsSubdomains.getRow(rowIndex);
    row.values = [
      page.url,
      page.success ? 'Active' : 'Inactive / Timeout',
      page.status || '-',
      page.error || '-'
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
          fgColor: { argb: page.success ? 'D1FAE5' : 'FEE2E2' } // soft green or soft red
        };
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: page.success ? '065F46' : '991B1B' } };
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
  // TAB 2: Categorization & Blogs
  // ==========================================
  const wsBlogs = workbook.addWorksheet('Page Categorization & Blogs');
  wsBlogs.views = [{ showGridLines: true }];

  // Title block
  wsBlogs.mergeCells('A1:F1');
  const titleRow2 = wsBlogs.getCell('A1');
  titleRow2.value = `Content breakdown & Blog/Article Discovery`;
  titleRow2.font = titleFont;
  wsBlogs.getRow(1).height = 30;

  // Let's count categories in subdomainsData
  const categoriesList = [
    'Publications', 'News', 'Events', 'People', 'Blogs', 'Services', 
    'Industries', 'Insights', 'About Us', 'Client Stories', 'Careers', 
    'Offices & Contacts', 'Home Page', 'General Information'
  ];
  const categoryCounts = {};
  categoriesList.forEach(cat => categoryCounts[cat] = 0);

  subdomainsData.forEach(page => {
    const cat = categorizeUrl(page.url);
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });

  // Table 1 Header (A4:B4) - Page Breakdown Summary
  wsBlogs.getCell('A3').value = 'Page Categories (Scanned)';
  wsBlogs.getCell('A3').font = boldCellFont;
  wsBlogs.getCell('A4').value = 'Category';
  wsBlogs.getCell('B4').value = 'Count';
  wsBlogs.getCell('A4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.primary } };
  wsBlogs.getCell('A4').font = headerFont;
  wsBlogs.getCell('B4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.primary } };
  wsBlogs.getCell('B4').font = headerFont;
  wsBlogs.getCell('B4').alignment = { horizontal: 'center' };

  // Populate Categories Table
  let catRowIdx = 5;
  categoriesList.forEach(cat => {
    wsBlogs.getCell(`A${catRowIdx}`).value = cat;
    wsBlogs.getCell(`B${catRowIdx}`).value = categoryCounts[cat];
    wsBlogs.getCell(`A${catRowIdx}`).border = thinBorder;
    wsBlogs.getCell(`A${catRowIdx}`).font = cellFont;
    wsBlogs.getCell(`B${catRowIdx}`).border = thinBorder;
    wsBlogs.getCell(`B${catRowIdx}`).font = boldCellFont;
    wsBlogs.getCell(`B${catRowIdx}`).alignment = { horizontal: 'center' };
    catRowIdx++;
  });

  // Table 2 Header (D3:F4) - Discovered Blogs
  wsBlogs.getCell('D3').value = 'Discovered Blog & Article Links';
  wsBlogs.getCell('D3').font = boldCellFont;
  wsBlogs.getCell('D4').value = 'No.';
  wsBlogs.getCell('E4').value = 'Blog / Article URL';
  wsBlogs.getCell('F4').value = 'Discovered On';
  ['D4', 'E4', 'F4'].forEach(cellRef => {
    const cell = wsBlogs.getCell(cellRef);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.primary } };
    cell.font = headerFont;
  });
  wsBlogs.getCell('D4').alignment = { horizontal: 'center' };

  // Populate Blogs Table
  let blogRowIdx = 5;
  blogArticlesData.forEach((item, idx) => {
    wsBlogs.getCell(`D${blogRowIdx}`).value = idx + 1;
    wsBlogs.getCell(`E${blogRowIdx}`).value = item.url;
    wsBlogs.getCell(`F${blogRowIdx}`).value = item.source;
    
    wsBlogs.getCell(`D${blogRowIdx}`).border = thinBorder;
    wsBlogs.getCell(`D${blogRowIdx}`).font = cellFont;
    wsBlogs.getCell(`D${blogRowIdx}`).alignment = { horizontal: 'center' };
    
    wsBlogs.getCell(`E${blogRowIdx}`).border = thinBorder;
    wsBlogs.getCell(`E${blogRowIdx}`).font = { name: 'Segoe UI', size: 10, color: { argb: '2563EB' }, underline: true };
    
    wsBlogs.getCell(`F${blogRowIdx}`).border = thinBorder;
    wsBlogs.getCell(`F${blogRowIdx}`).font = cellFont;
    
    blogRowIdx++;
  });

  // Detailed Scanned Pages Table starting at row 22
  const detailStartRow = Math.max(catRowIdx, blogRowIdx) + 2;
  wsBlogs.getCell(`A${detailStartRow - 1}`).value = 'Detailed Scanned Pages & Category Mapping';
  wsBlogs.getCell(`A${detailStartRow - 1}`).font = boldCellFont;

  const detailHeaders = ['URL / Page', 'Category', 'Response Code'];
  wsBlogs.getRow(detailStartRow).values = detailHeaders;
  wsBlogs.getRow(detailStartRow).height = 25;

  detailHeaders.forEach((_, colIndex) => {
    const cell = wsBlogs.getCell(detailStartRow, colIndex + 1);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.primary } };
    cell.font = headerFont;
    cell.alignment = { vertical: 'middle', horizontal: colIndex === 0 ? 'left' : 'center' };
  });

  subdomainsData.forEach((page, idx) => {
    const rowIndex = detailStartRow + 1 + idx;
    const row = wsBlogs.getRow(rowIndex);
    row.values = [
      page.url,
      categorizeUrl(page.url),
      page.status || '-'
    ];
    row.height = 20;

    for (let c = 1; c <= 3; c++) {
      const cell = wsBlogs.getCell(rowIndex, c);
      cell.font = cellFont;
      cell.border = thinBorder;
      cell.alignment = { vertical: 'middle', horizontal: c === 1 ? 'left' : 'center' };
      if (c === 2) {
        cell.font = boldCellFont;
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
