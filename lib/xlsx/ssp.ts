import JSZip from 'jszip';
import type { SspData } from '@/lib/pdf/ssp';

const SHEETS = [
  { name: 'Overview', builder: overviewRows },
  { name: 'People', builder: peopleRows },
  { name: 'Controls', builder: controlRows },
  { name: 'Essential Eight', builder: essentialEightRows },
  { name: 'Residual Risks', builder: residualRiskRows },
] as const;

type CellValue = string | number | null;
type Cell = { value: CellValue; style?: number };
type Row = Cell[];

export async function renderSspXlsx(data: SspData): Promise<Buffer> {
  const zip = new JSZip();

  zip.file('[Content_Types].xml', contentTypes());
  zip.file('_rels/.rels', rootRelationships());
  zip.file('docProps/core.xml', coreProperties(data));
  zip.file('docProps/app.xml', appProperties());
  zip.file('xl/workbook.xml', workbook());
  zip.file('xl/_rels/workbook.xml.rels', workbookRelationships());
  zip.file('xl/styles.xml', styles());

  SHEETS.forEach((sheet, index) => {
    const rows = sheet.builder(data);
    zip.file(`xl/worksheets/sheet${index + 1}.xml`, worksheet(rows, sheet.name));
  });

  const bytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return Buffer.from(bytes);
}

function overviewRows(data: SspData): Row[] {
  return [
    title(`System Security Plan v${data.exportVersion}`),
    blank(),
    section('Engagement'),
    pair('Engagement', data.engagement.name),
    pair('Reference', data.engagement.reference ?? ''),
    pair('Classification', data.engagement.classification.replace('_', ':')),
    pair('ISM revision', data.engagement.ismRevision),
    pair('Phase', data.engagement.phase),
    pair('Status', data.engagement.status),
    pair('Exported at', new Date(data.exportedAt).toLocaleString('en-AU')),
    pair('Engagement created', new Date(data.engagement.createdAt).toLocaleString('en-AU')),
    pair('Engagement last updated', new Date(data.engagement.updatedAt).toLocaleString('en-AU')),
    pair(
      'Started at',
      data.engagement.startedAt ? new Date(data.engagement.startedAt).toLocaleString('en-AU') : '',
    ),
    pair(
      'Target certification',
      data.engagement.targetCertificationAt
        ? new Date(data.engagement.targetCertificationAt).toLocaleString('en-AU')
        : '',
    ),
    pair(
      'Certified at',
      data.engagement.certifiedAt
        ? new Date(data.engagement.certifiedAt).toLocaleString('en-AU')
        : '',
    ),
    pair(
      'Boundary locked at',
      data.engagement.boundaryLockedAt
        ? new Date(data.engagement.boundaryLockedAt).toLocaleString('en-AU')
        : '',
    ),
    blank(),
    section('Organisations'),
    pair('Assessor tenant', data.tenant.name),
    pair('Client organisation', data.client.name),
    pair('Client ABN', data.client.abn ?? ''),
    blank(),
    section('System'),
    pair('System name', data.system.name),
    pair('Environment', data.system.environment ?? ''),
    pair('Description', data.system.description ?? ''),
    blank(),
    section('Boundary'),
    pair('Boundary version', data.boundary ? data.boundary.version : ''),
    pair('Boundary nodes', data.boundary ? data.boundary.nodes : ''),
    pair('Boundary edges', data.boundary ? data.boundary.edges : ''),
    blank(),
    section('Totals'),
    pair('Controls', data.summary.totalControls),
    pair('Remaining controls', data.summary.remainingControls),
    pair('Not started', data.summary.notStarted),
    pair('In progress', data.summary.inProgress),
    pair('Evidence pending', data.summary.evidencePending),
    pair('Implemented', data.summary.implemented),
    pair('Not applicable', data.summary.notApplicable),
    pair('Compensating', data.summary.compensating),
    pair('Not implemented', data.summary.notImplemented),
    pair('Undecided applicability', data.summary.undecidedApplicability),
    pair('Missing implementation statements', data.summary.missingImplementationStatements),
    pair('Essential Eight entries', data.summary.essentialEightCount),
    pair('Residual risks', data.summary.residualRiskCount),
  ];
}

function peopleRows(data: SspData): Row[] {
  return [
    title('People and Roles'),
    blank(),
    header(['Name', 'Email', 'Role', 'Joined at']),
    ...data.members.map((member) => [
      text(member.name ?? '', 4),
      text(member.email, 4),
      text(member.role, 4),
      text(member.joinedAt ? new Date(member.joinedAt).toLocaleString('en-AU') : '', 4),
    ]),
  ];
}

function controlRows(data: SspData): Row[] {
  return [
    title('Controls'),
    blank(),
    header([
      'Control ID',
      'Status',
      'Applicability',
      'Justification',
      'Assessment methods',
      'Assessment objects',
      'Evidence quality',
      'Evidence limitations',
      'Implementation statement',
      'Description',
    ]),
    ...data.controls.map((control) => [
      text(control.controlId, 4),
      text(control.status, 4),
      text(control.applicable ?? '', 4),
      text(control.justification ?? '', 5),
      text(control.assessmentMethods ?? '', 4),
      text(control.assessmentObjects ?? '', 5),
      text(control.evidenceQuality ?? '', 4),
      text(control.evidenceLimitations ?? '', 5),
      text(control.implementationStatement ?? '', 5),
      text(control.description ?? '', 5),
    ]),
  ];
}

function essentialEightRows(data: SspData): Row[] {
  return [
    title('Essential Eight'),
    blank(),
    header(['Strategy', 'Current maturity', 'Target maturity']),
    ...data.essentialEight.map((row) => [
      text(row.strategy, 4),
      text(row.currentMaturity, 4),
      text(row.targetMaturity, 4),
    ]),
  ];
}

function residualRiskRows(data: SspData): Row[] {
  return [
    title('Residual Risks'),
    blank(),
    header(['Title', 'Description', 'Mitigation']),
    ...data.residualRisks.map((risk) => [
      text(risk.title, 4),
      text(risk.description, 5),
      text(risk.mitigation, 5),
    ]),
  ];
}

function title(value: string): Row {
  return [text(value, 1)];
}

function section(value: string): Row {
  return [text(value, 2)];
}

function header(values: string[]): Row {
  return values.map((value) => text(value, 3));
}

function pair(label: string, value: CellValue): Row {
  return [text(label, 6), text(value, 4)];
}

function blank(): Row {
  return [];
}

function text(value: CellValue, style?: number): Cell {
  return { value, style };
}

function worksheet(rows: Row[], name: string) {
  const maxCols = Math.max(1, ...rows.map((row) => row.length));
  const dimension = `A1:${cellRef(rows.length, maxCols)}`;
  const hasTableHeader = rows[2]?.length > 1;
  const autoFilter = hasTableHeader ? `<autoFilter ref="A3:${cellRef(rows.length, maxCols)}"/>` : '';
  const sheetRows = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((cell, colIndex) => renderCell(cell, rowIndex + 1, colIndex + 1))
        .join('');
      return `<row r="${rowIndex + 1}"${rowIndex === 0 ? ' ht="24" customHeight="1"' : ''}>${cells}</row>`;
    })
    .join('');

  return xml(`\
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="${dimension}"/>
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  ${columnsFor(name)}
  <sheetData>${sheetRows}</sheetData>
  ${autoFilter}
</worksheet>`);
}

function renderCell(cell: Cell, row: number, col: number) {
  if (cell.value === null || cell.value === '') {
    return `<c r="${cellRef(row, col)}"${cell.style ? ` s="${cell.style}"` : ''}/>`;
  }
  if (typeof cell.value === 'number') {
    return `<c r="${cellRef(row, col)}"${cell.style ? ` s="${cell.style}"` : ''}><v>${cell.value}</v></c>`;
  }
  return `<c r="${cellRef(row, col)}" t="inlineStr"${cell.style ? ` s="${cell.style}"` : ''}><is><t>${escapeXml(cell.value)}</t></is></c>`;
}

function columnsFor(name: string) {
  const widths =
    name === 'Controls'
      ? [16, 18, 18, 44, 60, 60]
      : name === 'Overview'
        ? [28, 70]
        : name === 'People'
          ? [28, 42, 24, 28]
        : name === 'Residual Risks'
          ? [34, 70, 70]
          : [36, 20, 20];

  return `<cols>${widths
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join('')}</cols>`;
}

function workbook() {
  return xml(`\
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${SHEETS.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}
  </sheets>
</workbook>`);
}

function workbookRelationships() {
  return xml(`\
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${SHEETS.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}
  <Relationship Id="rId${SHEETS.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
}

function rootRelationships() {
  return xml(`\
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);
}

function contentTypes() {
  return xml(`\
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${SHEETS.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`);
}

function styles() {
  return xml(`\
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font><sz val="11"/><color rgb="FF0F172A"/><name val="Aptos"/></font>
    <font><b/><sz val="16"/><color rgb="FF0F172A"/><name val="Aptos"/></font>
    <font><b/><sz val="12"/><color rgb="FF0F3F2C"/><name val="Aptos"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEFF6F1"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F3F2C"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="7">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`);
}

function coreProperties(data: SspData) {
  const created = new Date(data.exportedAt).toISOString();
  return xml(`\
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(`System Security Plan v${data.exportVersion}`)}</dc:title>
  <dc:creator>${escapeXml(data.tenant.productName)}</dc:creator>
  <cp:lastModifiedBy>${escapeXml(data.tenant.productName)}</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified>
</cp:coreProperties>`);
}

function appProperties() {
  return xml(`\
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>OakAttest</Application>
</Properties>`);
}

function cellRef(row: number, col: number) {
  return `${columnName(col)}${row}`;
}

function columnName(col: number) {
  let value = '';
  let current = col;
  while (current > 0) {
    current -= 1;
    value = String.fromCharCode(65 + (current % 26)) + value;
    current = Math.floor(current / 26);
  }
  return value;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xml(value: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${value}`;
}
