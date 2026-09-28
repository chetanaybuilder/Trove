import PDFDocument from "pdfkit";
const lines = (c) => typeof c === "string" ? [c] : Array.isArray(c) ? c.map((x) => typeof x === "string" ? "• " + x : `• ${x.name}: ${x.detail}`) : [];

export function reportPdf(res, r) {
  const doc = new PDFDocument({ size: "A4", margins: { top: 72, bottom: 72, left: 64, right: 64 }, bufferPages: true, info: { Title: r.title, Producer: "Trove" } });
  doc.pipe(res);
  const w = doc.page.width - 128;
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#b8860b").text("TROVE", { characterSpacing: 4 });
  doc.moveDown(1.2).font("Times-Bold").fontSize(26).fillColor("#111").text(r.title);
  doc.moveDown(0.4).font("Helvetica").fontSize(9).fillColor("#666").text("Generated " + new Date(r.created_at).toLocaleDateString("en-US", { dateStyle: "long" }));
  doc.moveDown(0.6).moveTo(64, doc.y).lineTo(64 + w, doc.y).strokeColor("#ddd").stroke();
  for (const s of r.sections) {
    doc.moveDown(1).font("Helvetica-Bold").fontSize(13).fillColor("#111").text(s.title, { width: w });
    doc.moveDown(0.3).font("Times-Roman").fontSize(11).fillColor("#222");
    for (const l of lines(s.content)) doc.text(l, { width: w, lineGap: 3, paragraphGap: 4 });
  }
  const n = doc.bufferedPageRange().count;
  for (let i = 0; i < n; i++) {
    doc.switchToPage(i); doc.page.margins.bottom = 0; // avoid auto page-add when writing in the footer area
    doc.font("Helvetica").fontSize(8).fillColor("#888").text(`Trove · ${r.title.slice(0, 60)} · Page ${i + 1} of ${n}`, 64, doc.page.height - 44, { width: w, align: "center" });
  }
  doc.end();
}
