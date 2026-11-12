import { readFileSync } from 'node:fs';
const html=readFileSync('index.html','utf8');
const js=readFileSync('studio-v2.js','utf8');
const ids=[...new Set([...js.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]))];
const missing=ids.filter(id=>!html.includes('id="'+id+'"'));
if(missing.length){console.error('Missing DOM IDs:',missing.join(', '));process.exitCode=1;}
if(!html.includes('<script src="studio-v2.js" defer></script>')){console.error('Studio script is not linked');process.exitCode=1;}
if(html.includes('<iframe')){console.error('Blocking PDF iframe was reintroduced');process.exitCode=1;}
if(!html.includes('id="quote" disabled')){console.error('Unapproved checkout enabled');process.exitCode=1;}
if(!js.includes('Rule-based design applied')){console.error('Fallback labeling missing');process.exitCode=1;}
if(!js.includes('saveProject')||!js.includes('loadProject')){console.error('Project persistence missing');process.exitCode=1;}
if(!process.exitCode)console.log('PASS: '+ids.length+' DOM references, script linkage, checkout guard, project persistence, AI fallback labels.');
