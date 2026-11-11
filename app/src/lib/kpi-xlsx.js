// Builds a .xlsx matching the "PILLARS KPI MONITORING" sheet (layout, styles, live formulas) + a Daily Brief sheet.
(function () {
  const enc = new TextEncoder();
  const crcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {
    const parts = [], central = []; let off = 0;
    for (const [name, str] of files) {
      const data = enc.encode(str), nm = enc.encode(name), crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nm.length, true);
      parts.push(new Uint8Array(h.buffer), nm, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint32(16, crc, true);
      c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), nm);
      off += 30 + nm.length + data.length;
    }
    const csz = central.reduce((s, a) => s + a.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, csz, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const str = (r, s, v) => `<c r="${r}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  const num = (r, s, v) => `<c r="${r}" s="${s}"><v>${Number(v) || 0}</v></c>`;
  const fx = (r, s, f, v) => `<c r="${r}" s="${s}"><f>${esc(f)}</f><v>${isFinite(v) ? v : 0}</v></c>`;
  const fxs = (r, s, f, v) => `<c r="${r}" s="${s}" t="str"><f>${esc(f)}</f><v>${esc(v)}</v></c>`;
  const blank = (r, s) => `<c r="${r}" s="${s}"/>`;
  const col = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="165" formatCode="0.0"/></numFmts><fonts count="4"><font><sz val="11"/><name val="Aptos Narrow"/><family val="2"/></font><font><b/><sz val="10"/><name val="Aptos Narrow"/><family val="2"/></font><font><sz val="10"/><name val="Aptos Narrow"/><family val="2"/></font><font><b/><sz val="10"/><color rgb="FFFF0000"/><name val="Aptos Narrow"/><family val="2"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFC1D5EF"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="5"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color indexed="64"/></left><right style="thin"><color indexed="64"/></right><top style="thin"><color indexed="64"/></top><bottom style="thin"><color indexed="64"/></bottom><diagonal/></border><border><left style="thin"><color indexed="64"/></left><right/><top style="thin"><color indexed="64"/></top><bottom style="thin"><color indexed="64"/></bottom><diagonal/></border><border><left/><right/><top style="thin"><color indexed="64"/></top><bottom style="thin"><color indexed="64"/></bottom><diagonal/></border><border><left/><right style="thin"><color indexed="64"/></right><top style="thin"><color indexed="64"/></top><bottom style="thin"><color indexed="64"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="18"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="1" fontId="1" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="1" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf><xf numFmtId="1" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="9" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="4" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="165" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="1"><dxf><font><b/><color rgb="FFC00000"/></font><numFmt numFmtId="166" formatCode="&quot;▼ &quot;0%"/><fill><patternFill><bgColor rgb="FFFBE3EC"/></patternFill></fill></dxf></dxfs></styleSheet>`;

  function kpiSheet(report) {
    const D0 = 14, dayCols = Array.from({ length: report.daysInMonth }, (_, i) => col(D0 + i));
    const lastDay = dayCols[report.day - 1], helper = col(D0 + report.daysInMonth), wcol = col(D0 + report.daysInMonth + 1);
    const rows = [], merges = ['A1:C1'];
    rows.push(`<row r="1" ht="13.5" customHeight="1">${str('A1', 12, report.title)}${blank('B1', 13)}${blank('C1', 13)}${'DEFGHIJKL'.split('').map(c => blank(c + '1', 15)).join('')}${str('M1', 16, report.monthName)}${num('N1', 1, report.day)}${dayCols.map(c => blank(c + '1', 15)).join('')}${num(helper + '1', 2, report.workDays ?? report.daysInMonth)}${num(wcol + '1', 2, report.workElapsed ?? report.day)}</row>`);
    const H = ['S.NO', 'NAME', 'Designation', 'KPI', 'FREQUENCY', 'UOM', 'MONTHLY TARGET', 'Per Day', 'Target\nTill Date', 'ACHVD \nTill Date', 'DIFF', 'ACHVD %', 'Min %\nto Attain', 'REMARKS'];
    rows.push(`<row r="2" ht="27.6">${H.map((h, i) => str(col(i) + '2', i === 7 ? 3 : 1, h)).join('')}${dayCols.map((c, i) => num(c + '2', 1, i + 1)).join('')}${blank(helper + '2', 0)}${str(wcol + '2', 1, 'WEIGHT')}</row>`);
    let r = 3;
    for (const p of report.people) {
      const start = r;
      p.kpis.forEach((k, i) => {
        const F = +k.monthly || 0, A = +k.achieved || 0, G = k.pdOv ?? (k.level ? F : F / (report.workDays || report.daysInMonth)), T = k.tdOv ?? (k.level ? F : G * (report.workElapsed ?? report.day)), cells = [];
        cells.push(i === 0 ? num(`A${r}`, 14, p.sno) : blank(`A${r}`, 14));
        cells.push(i === 0 ? str(`B${r}`, 11, p.name) : blank(`B${r}`, 11));
        cells.push(i === 0 ? str(`C${r}`, 11, p.designation) : blank(`C${r}`, 11));
        cells.push(str(`D${r}`, 4, k.name), str(`E${r}`, 5, k.freq || ''), str(`F${r}`, 5, k.uom), num(`G${r}`, 6, F));
        const small = !k.level && k.pdOv == null && G < 1, Tx = small && k.tdOv == null ? Math.floor(G * (report.workElapsed ?? report.day) + 1e-9) : T;
        cells.push(k.pdOv != null ? num(`H${r}`, 17, G) : k.level ? fx(`H${r}`, 17, `G${r}`, G) : small ? str(`H${r}`, 17, k.perLabel || '') : fx(`H${r}`, 17, `G${r}/$${helper}$1`, G));
        cells.push(k.tdOv != null ? num(`I${r}`, 17, T) : small ? fx(`I${r}`, 17, `ROUNDDOWN(G${r}*$${wcol}$1/$${helper}$1+0.000000001,0)`, Tx) : !k.level ? fx(`I${r}`, 17, `H${r}*$${wcol}$1`, T) : fx(`I${r}`, 17, `G${r}`, T));
        cells.push(k.staticAch ? num(`J${r}`, 17, A) : fx(`J${r}`, 6, `SUM(${dayCols[0]}${r}:${lastDay}${r})`, A));
        cells.push(fx(`K${r}`, 17, `I${r}-J${r}`, Tx - A), fx(`L${r}`, 10, `IFERROR(J${r}/I${r},0)`, Tx ? A / Tx : 0));
        cells.push(num(`M${r}`, 10, (+k.min || 0) / 100), (k.remarks || k.remarksExtra) ? str(`N${r}`, 5, [k.remarks, k.remarksExtra].filter(Boolean).join(' · ')) : blank(`N${r}`, 5));
        dayCols.forEach((c, j) => { const v = (k.dailyOverride || k.daily)[j]; cells.push(v === '' || v == null ? blank(c + r, 6) : num(c + r, 6, v)); });
        cells.push(blank(helper + r, 0), num(wcol + r, 5, k.wEff === undefined ? 1 : k.wEff));
        rows.push(`<row r="${r}">${cells.join('')}</row>`); r++;
      });
      if (p.kpis.length > 1) ['A', 'B', 'C'].forEach(c => merges.push(`${c}${start}:${c}${r - 1}`));
    }
    const last = r - 1;
    let cf = '';
    if (r > 3) {
      const L = `L3:L${last}`, cells = [];
      'ABCDEFGHIJK'.split('').forEach(c => cells.push(c === 'A' ? str('A' + r, 1, 'TOTAL ACHIEVED % (Target 100%)') : blank(c + r, 1)));
      const W = `${wcol}3:${wcol}${last}`;
      cells.push(fx('L' + r, 10, `IFERROR(SUMPRODUCT(((${L}>1)+(${L}<=1)*${L})*${W})/SUM(${W}),0)`, report.total || 0));
      cells.push(num('M' + r, 10, 1), fxs('N' + r, 5, `IF(L${r}>=1,"Target met","Short by "&TEXT(1-L${r},"0%"))`, report.total >= 1 ? 'Target met' : 'Short by ' + Math.round((1 - report.total) * 100) + '%'));
      rows.push(`<row r="${r}">${cells.join('')}</row>`); merges.push(`A${r}:K${r}`);
      if (report.submitted) {
        const sr = r + 1, sc = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'].map(c => c === 'A' ? str('A' + sr, 1, 'DAILY SUBMISSION (✓ = submitted)') : blank(c + sr, 1));
        dayCols.forEach((c, j) => sc.push(report.submitted[j] ? str(c + sr, 5, '✓') : blank(c + sr, 5)));
        rows.push(`<row r="${sr}">${sc.join('')}</row>`); merges.push(`A${sr}:N${sr}`);
      }
      const rule = report.threshold === '100' ? `L3<1` : `L3<M3`;
      cf = `<conditionalFormatting sqref="L3:L${last}"><cfRule type="expression" dxfId="0" priority="1"><formula>${esc(rule)}</formula></cfRule></conditionalFormatting><conditionalFormatting sqref="L${r}"><cfRule type="expression" dxfId="0" priority="2"><formula>L${r}&lt;1</formula></cfRule></conditionalFormatting>`;
    }
    const widths = [5.11, 19.55, 24.44, 56.55, 11, 8.44, 9.11, 7.11, 7.66, 7.66, 6, 8.66, 7.89, 18, ...dayCols.map(() => 4.5), 3, 8];
    const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView tabSelected="1" zoomScale="110" workbookViewId="0"><pane xSplit="3" ySplit="2" topLeftCell="D3" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="13.8"/><cols>${cols}</cols><sheetData>${rows.join('')}</sheetData><mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>${cf}<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;
  }

  function briefSheet(report) {
    const H = ['DATE', 'KPI', 'DETAILED ACTIVITY', 'UOM', 'ACHIEVED', 'STATUS', 'REFERENCE LINK'];
    const rows = [`<row r="1" ht="20">${H.map((h, i) => str(col(i) + '1', 1, h)).join('')}</row>`];
    (report.brief || []).forEach((b, i) => {
      const r = i + 2, url = String(b.link || '').replace(/"/g, '%22');
      rows.push(`<row r="${r}">${str('A' + r, 5, b.date)}${str('B' + r, 4, b.target)}${str('C' + r, 4, b.activity)}${str('D' + r, 5, b.uom)}${num('E' + r, 6, b.qty)}${str('F' + r, 5, b.status || 'Completed')}${url ? fxs('G' + r, 4, `HYPERLINK("${url}","${url}")`, url) : blank('G' + r, 4)}</row>`);
    });
    const cols = [12, 48, 56, 8, 10, 13, 48].map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="13.8"/><cols>${cols}</cols><sheetData>${rows.join('')}</sheetData><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;
  }

  // report: { title, monthName, day, daysInMonth, total, threshold:'min'|'100', people:[{sno,name,designation,kpis:[{name,freq,uom,monthly,prorate,achieved,min,remarks,daily[]}]}], brief:[{date,target,activity,uom,qty,link}] }
  function build(report) {
    return zip([
      ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`],
      ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`],
      ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Pillars KPI</dc:title><dc:creator>Pillars KPI Portal</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:modified></cp:coreProperties>`],
      ['docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Excel</Application><DocSecurity>0</DocSecurity></Properties>`],
      ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="KPI ${esc(report.monthName)}" sheetId="1" r:id="rId1"/><sheet name="Daily Brief" sheetId="2" r:id="rId3"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`],
      ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
      ['xl/styles.xml', styles],
      ['xl/worksheets/sheet1.xml', kpiSheet(report)],
      ['xl/worksheets/sheet2.xml', briefSheet(report)],
    ]);
  }
  function buildBrief(rep) {
    const n = rep.cols.length, last = col(n - 1);
    const rows = [`<row r="1" ht="22">${str('A1', 1, rep.title)}</row>`, `<row r="2" ht="20">${rep.cols.map((h, i) => str(col(i) + '2', 1, h)).join('')}</row>`];
    rep.rows.forEach((v, i) => { const r = i + 3;
      rows.push(`<row r="${r}">${v.map((x, j) => { const c = col(j) + r;
        if (j === 4 && x !== '' && isFinite(+x)) return num(c, 6, +x);
        if (j === n - 1 && x) { const u = String(x).replace(/"/g, '%22'); return fxs(c, 4, `HYPERLINK("${u}","${u}")`, u); }
        return str(c, j === 0 || j === 5 || j === 6 || j === 7 ? 5 : 4, x); }).join('')}</row>`); });
    const widths = [13, 22, 40, 52, 10, 8, 15, 13, 28, 28, 40];
    const cols = widths.slice(0, n).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView tabSelected="1" workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="13.8"/><cols>${cols}</cols><sheetData>${rows.join('')}</sheetData><autoFilter ref="A2:${last}${Math.max(2, rep.rows.length + 2)}"/><pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
    const now = new Date().toISOString().slice(0, 19) + 'Z';
    return zip([
      ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`],
      ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`],
      ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Daily Brief</dc:title><dc:creator>Pillars KPI Portal</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`],
      ['docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Excel</Application><DocSecurity>0</DocSecurity></Properties>`],
      ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Daily Brief" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'Daily Brief'!$A$2:$${last}$${Math.max(2, rep.rows.length + 2)}</definedName></definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`],
      ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
      ['xl/styles.xml', styles],
      ['xl/worksheets/sheet1.xml', sheet],
    ]);
  }
  window.KPIXlsx = { build, buildBrief };
})();
