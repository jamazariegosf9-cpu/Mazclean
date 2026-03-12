import { createRoot } from 'react-dom/client'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(<App />)
```

Luego en la terminal:
```
git add .
git commit -m "Remove StrictMode fix locks"
git push