const fs = require('fs');

let appLayout = fs.readFileSync('src/components/AppLayout.tsx', 'utf8');
appLayout = appLayout.replace(
  /\/\/ Update view based on pathname\r?\n\s*useEffect\(\(\) => \{\r?\n\s*if \(!pathname\) \{/,
  "// Update view based on pathname\n  useEffect(() => {\n    queueMicrotask(() => {\n      if (!pathname) {"
).replace(
  /        \}\r?\n    \}\r?\n  \}, \[pathname\]\);/,
  "        });\n    }\n    });\n  }, [pathname]);"
);
fs.writeFileSync('src/components/AppLayout.tsx', appLayout);

let stickyNote = fs.readFileSync('src/components/StickyNoteCard.tsx', 'utf8');
stickyNote = stickyNote.replace(
  /\}, \[note\.content, isEditing\]\);/,
  "}, [note.content, isEditing, localContent]);"
).replace(
  /\/\/ Debounced update to parent\r?\n\s*React\.useEffect\(\(\) => \{\r?\n\s*const timer = setTimeout\(\(\) => \{\r?\n\s*if \(localContent !== note\.content\) \{\r?\n\s*onChangeContent\(localContent\);\r?\n\s*\}\r?\n\s*\}, 500\);\r?\n\s*return \(\) => clearTimeout\(timer\);\r?\n\s*\}, \[localContent, onChangeContent, note\.content\]\);/,
  "// Use latest callback reference without triggering re-renders\n    const onChangeContentRef = React.useRef(onChangeContent);\n    React.useEffect(() => {\n        onChangeContentRef.current = onChangeContent;\n    }, [onChangeContent]);\n\n    // Debounced update to parent\n    React.useEffect(() => {\n        const timer = setTimeout(() => {\n            if (localContent !== note.content) {\n                onChangeContentRef.current(localContent);\n            }\n        }, 500);\n        return () => clearTimeout(timer);\n    }, [localContent, note.content]);"
);
fs.writeFileSync('src/components/StickyNoteCard.tsx', stickyNote);

console.log("Patched smoothly!");
