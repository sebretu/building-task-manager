const fs = require('fs');
const file = 'web/src/app/materials/MaterialsClient.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/quantity: number;/g, 'quantity: number | "";\n    category?: string;');
content = content.replace(/quantity: 1/g, 'quantity: ""');

content = content.replace(
/item.materialId === mat.id\n\s+\? \{ \.\.\.item, quantity: item.quantity \+ 1 \}/g, 
`item.materialId === mat.id
                        ? { ...item, quantity: (item.quantity === "" ? 0 : item.quantity) + 1 }`
);

content = content.replace(
/unit: mat.unit,\n\s+quantity:/g, 
`unit: mat.unit,\n                category: mat.category,\n                quantity:`
);

content = content.replace(
/const emptyItems = cart.filter(.*?)(\n\s+if \(emptyItems\.length > 0\).*?return;\n\s+\})/s, 
`const emptyItems = cart.filter(item => !item.materialId && !item.name.trim());
        if (emptyItems.length > 0) {
            setError("Uzupełnij nazwy wszystkich pozycji w koszyku przed wysłaniem.");
            return;
        }

        const missingQty = cart.filter(item => item.quantity === "" || item.quantity <= 0);
        if (missingQty.length > 0) {
            setError("Wprowadź prawidłową ilość dla wszystkich materiałów.");
            return;
        }`
);

content = content.replace(/step="0.01"/g, 'step="1"');

// Fix display
content = content.replace(
/\{item\.name\}\n\s+<\/span>/g, 
`{item.name}
                                                                {item.category && <span style={{ fontSize: 12, color: "var(--home-muted)", display: "block", marginTop: 2 }}>{item.category}</span>}
                                                            </span>`
);

// fix empty input setting to empty string instead of ignoring
content = content.replace(
                                                                /onChange=\{e => \{\n\s+const val = parseFloat\(e\.target\.value\.replace\(",", "\."\)\);\n\s+if \(!isNaN\(val\) && val > 0\) \{\n\s+setCart\(prev => prev.map\(ci =>\n\s+ci\.id === item\.id \? \{ \.\.\.ci, quantity: val \} : ci\n\s+\)\);\n\s+\}\n\s+\}\}/g,
`onChange={e => {
                                                                    const valString = e.target.value;
                                                                    if (valString === '') {
                                                                        setCart(prev => prev.map(ci => ci.id === item.id ? { ...ci, quantity: "" } : ci));
                                                                        return;
                                                                    }
                                                                    const val = parseFloat(valString.replace(",", "."));
                                                                    if (!isNaN(val) && val >= 0) {
                                                                        setCart(prev => prev.map(ci =>
                                                                            ci.id === item.id ? { ...ci, quantity: val } : ci
                                                                        ));
                                                                    }
                                                                }}`
);


fs.writeFileSync(file, content);
