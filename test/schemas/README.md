# ISO 20022 XML schemas (vendored)

These are the **official** ISO 20022 message-definition schemas, used only by the
test suite to validate PayBatch's generated XML (`npm test`, via `xmllint`):

| File | Message | Used by |
|------|---------|---------|
| `pain.001.001.09.xsd` | CustomerCreditTransferInitiationV09 | UK domestic GBP — [src/iso20022.js](../../src/iso20022.js) |
| `pain.001.001.03.xsd` | CustomerCreditTransferInitiationV03 | SEPA EUR — [src/sepa.js](../../src/sepa.js) |

Source: <https://www.iso20022.org/> (Payments – `pain` message set). They are not
shipped in the application bundle — `build.files` in `package.json` excludes
`test/`. To refresh, download the matching schema zip from iso20022.org and
replace the `.xsd` here, then run `npm test`.
