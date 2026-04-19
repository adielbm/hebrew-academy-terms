#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOURCE_HTML_DIR = path.join(ROOT, 'source-html');
const OUTPUT_DATA_DIR = path.join(ROOT, 'data-v2');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DATA_DIR)) {
  fs.mkdirSync(OUTPUT_DATA_DIR, { recursive: true });
}

// Precompile regex patterns for performance
const KETA_CONTAINER_REGEX = /<div\s+class="keta-general-container"\s+data-id="(\d+)"[^>]*>[\s\S]*?(?=<div\s+class="keta-general-container"\s+data-id="|$)/g;
const NIRDAF_TEXT_REGEX = /<a\s+class="nirdaf_text"[^>]*>([^<]+)<\/a>/g;
const LTR_DIR_BLOCK_REGEX = /<div\s+class="ltr-dir">([\s\S]*?)<\/div>/g;
const KETA_KVUTSAT_NIRDAFIM_REGEX = /<span\s+class="keta_kvutsat-nirdafim">([\s\S]*?)(?=<span\s+class="keta_kvutsat-nirdafim"|<div\s+class="munnah-bemillon-mekori"|<div\s+class="ltr-dir"|<div\s+class="keta_pilluah-le-millon"|$)/g;
const KETA_NIRDAF_HESBER_REGEX = /<span\s+class="keta_nirdaf-hesber"[^>]*>([^<]+)<\/span>/g;
const NIRDAF_TSURA_MEKORIT_REGEX = /<span\s+class="nirdaf-tsura-mekorit"[^>]*>([\s\S]*?)<\/span>/g;
const PILUAH_BLOCK_REGEX = /<div\s+class="keta_pilluah-le-millon">([\s\S]*?)<\/div>/;
const KETA_HELEK_SAFA_REGEX = /<span\s+class="keta_helek-safa">Latin:\s*<\/span>/;
const HTML_LINK_TEXT_REGEX = /<a[^>]*>([\s\S]*?)<\/a>/g;
const TITLE_REGEX = /<title>([^|]+)/;
const HTML_ENTITY_DECODE_REGEX = /&([a-z]+);/gi;

// HTML entity decoder
const htmlEntityMap = {
  'amp': '&',
  'lt': '<',
  'gt': '>',
  'quot': '"',
  'apos': "'",
  'nbsp': ' '
};

function decodeHtmlEntities(text) {
  return text.replace(HTML_ENTITY_DECODE_REGEX, (match, entity) => {
    return htmlEntityMap[entity] || match;
  });
}

function stripHtmlTags(html) {
  return html.replace(/<[^>]*>/g, '').trim();
}

function normalizeText(text) {
  return decodeHtmlEntities(stripHtmlTags(text)).trim();
}

function normalizePiluahText(text) {
  return normalizeText(text)
    .replace(/\s*>\s*/g, ' > ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function getSectionBeforeFirstLtr(blockHtml) {
  const ltrStart = blockHtml.indexOf('<div class="ltr-dir">');
  if (ltrStart === -1) {
    return blockHtml;
  }
  return blockHtml.slice(0, ltrStart);
}

function extractEnglishTerms(blockHtml) {
  const englishTerms = [];
  const seen = new Set();
  LTR_DIR_BLOCK_REGEX.lastIndex = 0;
  let ltrMatch;
  while ((ltrMatch = LTR_DIR_BLOCK_REGEX.exec(blockHtml)) !== null) {
    const ltrHtml = ltrMatch[1];
    
    // Skip if this is a Latin section
    if (KETA_HELEK_SAFA_REGEX.test(ltrHtml)) {
      continue;
    }

    // Parse groups so each English term can carry its own hesber/definition.
    const kvutsatRegex = /<span\s+class="keta_kvutsat-nirdafim">([\s\S]*?)(?=<span\s+class="keta_kvutsat-nirdafim"|<div|$)/g;
    kvutsatRegex.lastIndex = 0;
    let kvutsatMatch;

    while ((kvutsatMatch = kvutsatRegex.exec(ltrHtml)) !== null) {
      const kvutsatHtml = kvutsatMatch[1];

      let definition = '';
      KETA_NIRDAF_HESBER_REGEX.lastIndex = 0;
      const hesberMatch = KETA_NIRDAF_HESBER_REGEX.exec(kvutsatHtml);
      if (hesberMatch) {
        definition = normalizeText(hesberMatch[1]);
      }

      const groupTerms = [];
      NIRDAF_TEXT_REGEX.lastIndex = 0;
      let termMatch;
      while ((termMatch = NIRDAF_TEXT_REGEX.exec(kvutsatHtml)) !== null) {
        const normalizedTerm = normalizeText(termMatch[1]);
        if (normalizedTerm && !groupTerms.includes(normalizedTerm)) {
          groupTerms.push(normalizedTerm);
        }
      }

      for (const term of groupTerms) {
        const key = `${term}|||${definition}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        englishTerms.push({
          term: term,
          def: definition
        });
      }
    }

    // Fallback when no group wrapper is available in this ltr block.
    if (!ltrHtml.includes('keta_kvutsat-nirdafim')) {
      NIRDAF_TEXT_REGEX.lastIndex = 0;
      let termMatch;
      while ((termMatch = NIRDAF_TEXT_REGEX.exec(ltrHtml)) !== null) {
        const normalizedTerm = normalizeText(termMatch[1]);
        if (!normalizedTerm) {
          continue;
        }
        const key = `${normalizedTerm}|||`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        englishTerms.push({ term: normalizedTerm, def: '' });
      }
    }
  }
  return englishTerms;
}

function extractPiluah(blockHtml) {
  const piluahMatch = blockHtml.match(PILUAH_BLOCK_REGEX);
  if (!piluahMatch) {
    return '';
  }

  const links = [];
  HTML_LINK_TEXT_REGEX.lastIndex = 0;
  let linkMatch;
  while ((linkMatch = HTML_LINK_TEXT_REGEX.exec(piluahMatch[1])) !== null) {
    const text = normalizePiluahText(linkMatch[1]);
    if (text) {
      links.push(text);
    }
  }

  if (links.length > 0) {
    return links[links.length - 1];
  }

  return normalizePiluahText(piluahMatch[1]);
}

function extractHesberTerms(blockHtml) {
  const hesberTerms = [];
  KETA_NIRDAF_HESBER_REGEX.lastIndex = 0;
  let hesberMatch;
  while ((hesberMatch = KETA_NIRDAF_HESBER_REGEX.exec(blockHtml)) !== null) {
    const normalizedHesber = normalizeText(hesberMatch[1]);
    if (normalizedHesber && !hesberTerms.includes(normalizedHesber)) {
      hesberTerms.push(normalizedHesber);
    }
  }
  return hesberTerms;
}

function extractLatinNames(blockHtml) {
  const latinNames = [];
  
  // Find ltr-dir blocks that contain Latin: marker
  LTR_DIR_BLOCK_REGEX.lastIndex = 0;
  let ltrMatch;
  
  while ((ltrMatch = LTR_DIR_BLOCK_REGEX.exec(blockHtml)) !== null) {
    const ltrHtml = ltrMatch[1];
    
    // Check if this block has Latin marker
    if (!KETA_HELEK_SAFA_REGEX.test(ltrHtml)) {
      continue;
    }
    
    // Extract kvutsat-nirdafim groups for Latin names
    const kvutsatRegex = /<span\s+class="keta_kvutsat-nirdafim">([\s\S]*?)(?=<span\s+class="keta_kvutsat-nirdafim"|<div|$)/g;
    kvutsatRegex.lastIndex = 0;
    let kvutsatMatch;
    
    while ((kvutsatMatch = kvutsatRegex.exec(ltrHtml)) !== null) {
      const kvutsatHtml = kvutsatMatch[1];
      
      // Extract Latin terms (usually same text repeated)
      const terms = [];
      NIRDAF_TEXT_REGEX.lastIndex = 0;
      let termMatch;
      while ((termMatch = NIRDAF_TEXT_REGEX.exec(kvutsatHtml)) !== null) {
        const normalizedTerm = normalizeText(termMatch[1]);
        if (normalizedTerm && !terms.includes(normalizedTerm)) {
          terms.push(normalizedTerm);
        }
      }
      
      // Extract hesber for Latin term (like "L.", "Endl.", etc.)
      let definition = '';
      KETA_NIRDAF_HESBER_REGEX.lastIndex = 0;
      const hesberMatch = KETA_NIRDAF_HESBER_REGEX.exec(kvutsatHtml);
      if (hesberMatch) {
        definition = normalizeText(hesberMatch[1]);
      }
      
      // Emit one object per unique Latin term in the group.
      for (const term of terms) {
        latinNames.push({
          term: term,
          def: definition,
          source: ''
        });
      }
    }
  }
  
  return latinNames;
}

function extractRemarks(blockHtml) {
  const remarks = [];
  
  // Find plain text divs (divs without class attribute that contain text)
  const plainDivRegex = /<div>([^<]+)<\/div>/g;
  plainDivRegex.lastIndex = 0;
  let divMatch;
  
  while ((divMatch = plainDivRegex.exec(blockHtml)) !== null) {
    const text = normalizeText(divMatch[1]);
    const isJsTemplateArtifact =
      text.includes('item.TsuraMeudkenet') ||
      /^"\s*\+\s*item\./.test(text) ||
      /\+\s*"$/.test(text);

    if (text && !text.startsWith('*') && !text.match(/^\d+$/) && !isJsTemplateArtifact) {
      // Avoid asterisks and numeric-only text
      remarks.push(text);
    }
  }
  
  return remarks;
}

function extractMesumman(blockHtml) {
  const mesummanMap = new Map(); // Use map to avoid duplicates
  
  // Find all munnahim-le-mesumman spans which contain the mesumman data
  const munnahimRegex = /<span\s+class="munnahim-le-mesumman"\s+data-kod-mesumman="(\d+)"[^>]*>([\s\S]*?)<\/span>\s*<a\s+class="[^"]*hearat-mesumman-link[^"]*"[^>]*>/g;
  munnahimRegex.lastIndex = 0;
  let munnahimMatch;
  
  while ((munnahimMatch = munnahimRegex.exec(blockHtml)) !== null) {
    const kod = munnahimMatch[1];
    const munnahimHtml = munnahimMatch[2];
    
    // Skip if we already have this kod (to avoid duplicates from meudkan/ktiv-male versions)
    if (mesummanMap.has(kod)) continue;
    
    const mesummanData = {
      kod: kod,
      alternatives: [],
      additional_terms: []
    };
    
    // Extract מונחים נוספים באותה המשמעות (additional terms with same meaning)
    // Look for spans with class keta_munnah-meudkan or keta_munnah-ktiv-male
    // Pattern: <span class="keta_munnah-meudkan">TERM</span>
    const meudkanRegex = /<span\s+class="keta_munnah-meudkan[^"]*">([^<]+)<\/span>/g;
    meudkanRegex.lastIndex = 0;
    let meudkanMatch;
    
    while ((meudkanMatch = meudkanRegex.exec(munnahimHtml)) !== null) {
      const term = normalizeText(meudkanMatch[1]);
      if (term && !mesummanData.additional_terms.includes(term)) {
        mesummanData.additional_terms.push(term);
      }
    }
    
    // Also try to get ktiv-male version if it exists and is different
    const ktvMaleRegex = /<span\s+class="keta_munnah-ktiv-male[^"]*">([^<]+)<\/span>/g;
    ktvMaleRegex.lastIndex = 0;
    let ktvMatch;
    
    while ((ktvMatch = ktvMaleRegex.exec(munnahimHtml)) !== null) {
      const term = normalizeText(ktvMatch[1]);
      if (term && !mesummanData.additional_terms.includes(term)) {
        mesummanData.additional_terms.push(term);
      }
    }
    
    // Extract any notes/qualifiers like "(לועזי)"
    const noteRegex = /<span>\s*\(([^)]+)\)\s*<\/span>/;
    const noteMatch = munnahimHtml.match(noteRegex);
    const note = noteMatch ? normalizeText(noteMatch[1]) : null;
    
    // If we have additional terms and a note, append it to each term
    if (note && mesummanData.additional_terms.length > 0) {
      mesummanData.additional_terms = mesummanData.additional_terms.map(term => `${term} (${note})`);
    }
    
    mesummanMap.set(kod, mesummanData);
  }
  
  return Array.from(mesummanMap.values());
}

function extractHebrewVariants(preLtrSection) {
  const variants = [];
  const mekoriTargets = [];
  const groupMatches = [];

  KETA_KVUTSAT_NIRDAFIM_REGEX.lastIndex = 0;
  let kvutsatMatch;
  while ((kvutsatMatch = KETA_KVUTSAT_NIRDAFIM_REGEX.exec(preLtrSection)) !== null) {
    groupMatches.push({
      html: kvutsatMatch[1],
      start: kvutsatMatch.index,
      end: KETA_KVUTSAT_NIRDAFIM_REGEX.lastIndex
    });
  }

  if (groupMatches.length === 0) {
    return [];
  }

  for (let index = 0; index < groupMatches.length; index++) {
    const groupMatch = groupMatches[index];
    const kvutsatHtml = groupMatch.html;

    const linkEntries = [];
    NIRDAF_TEXT_REGEX.lastIndex = 0;
    let termMatch;
    while ((termMatch = NIRDAF_TEXT_REGEX.exec(kvutsatHtml)) !== null) {
      const normalizedTerm = normalizeText(termMatch[1]);
      if (normalizedTerm) {
        linkEntries.push({
          text: normalizedTerm,
          index: termMatch.index,
          hasTsura: false
        });
      }
    }

    if (linkEntries.length === 0) {
      continue;
    }

    for (let linkIndex = 0; linkIndex < linkEntries.length; linkIndex++) {
      const current = linkEntries[linkIndex];
      const next = linkEntries[linkIndex + 1];
      const segmentEnd = next ? next.index : kvutsatHtml.length;
      const segment = kvutsatHtml.slice(current.index, segmentEnd);
      current.hasTsura = segment.includes('tsura-shona');
    }

    let definition = '';
    KETA_NIRDAF_HESBER_REGEX.lastIndex = 0;
    const hesberMatch = KETA_NIRDAF_HESBER_REGEX.exec(kvutsatHtml);
    if (hesberMatch) {
      definition = normalizeText(hesberMatch[1]);
    }

    const variant = {
      terms: [],
      def: definition
    };

    for (let termIndex = 0; termIndex < linkEntries.length; termIndex += 2) {
      const withEntry = linkEntries[termIndex];
      const withoutEntry = linkEntries[termIndex + 1];
      const hebrewWithVowels = withEntry ? withEntry.text : '';
      const hebrewWithoutVowels = withoutEntry ? withoutEntry.text : hebrewWithVowels;
      const termObj = {
        haser: hebrewWithVowels,
        male: hebrewWithoutVowels,
        source: ''
      };
      variant.terms.push(termObj);

      if ((withEntry && withEntry.hasTsura) || (withoutEntry && withoutEntry.hasTsura)) {
        mekoriTargets.push(termObj);
      }
    }

    variants.push(variant);
  }

  const mekoriList = [];
  NIRDAF_TSURA_MEKORIT_REGEX.lastIndex = 0;
  let mekoriMatch;
  while ((mekoriMatch = NIRDAF_TSURA_MEKORIT_REGEX.exec(preLtrSection)) !== null) {
    mekoriList.push(normalizeText(mekoriMatch[1]));
  }

  for (let i = 0; i < mekoriList.length && i < mekoriTargets.length; i++) {
    mekoriTargets[i].source = mekoriList[i];
  }

  return variants;
}

function dedupeIdenticalTerms(terms) {
  const uniqueTerms = [];
  const seen = new Set();

  for (const term of terms) {
    const key = JSON.stringify(term);
    if (!seen.has(key)) {
      seen.add(key);
      uniqueTerms.push(term);
    }
  }

  return uniqueTerms;
}

function extractDictionaryMetadata(html) {
  const titleMatch = html.match(TITLE_REGEX);
  const dictionaryName = titleMatch ? normalizeText(titleMatch[1]) : '';
  return {
    dictionaryName,
    dictionaryCode: '',
    year: ''
  };
}

function extractTermsFromHtml(html) {
  const terms = [];
  
  // Find all keta-general-container blocks
  let blockMatch;
  KETA_CONTAINER_REGEX.lastIndex = 0;
  
  while ((blockMatch = KETA_CONTAINER_REGEX.exec(html)) !== null) {
    const blockHtml = blockMatch[0];
    const dataId = blockMatch[1];
    const preLtrSection = getSectionBeforeFirstLtr(blockHtml);
    
    // Extract Hebrew variants with grouped terms and per-term mekorit
    const hebrewVariants = extractHebrewVariants(preLtrSection);
    
    // Extract English terms (all ltr-dir blocks)
    const englishTerms = extractEnglishTerms(blockHtml);
    const latinNames = extractLatinNames(blockHtml);
    const remarks = extractRemarks(blockHtml);
    const mesumman = extractMesumman(blockHtml);
    const piluah = extractPiluah(blockHtml);
    
    // Create term object
    if (hebrewVariants.length > 0 || englishTerms.length > 0) {
      const term = {
        id: dataId,
        he: hebrewVariants,
        en: englishTerms,
        la: latinNames,
        remarks: remarks,
        mesumman: mesumman,
        subject: piluah,
        is_obsolete: false,
        synonyms: []
      };
      
      terms.push(term);
    }
  }
  
  return dedupeIdenticalTerms(terms);
}

function extractDictionaryCodeFromFileName(fileName) {
  const match = fileName.match(/kod_(\d+)/);
  return match ? match[1] : null;
}

function pruneEmpty(value) {
  if (Array.isArray(value)) {
    const cleanedArray = value
      .map(pruneEmpty)
      .filter(item => item !== undefined);
    return cleanedArray.length > 0 ? cleanedArray : undefined;
  }

  if (value && typeof value === 'object') {
    const cleanedObject = {};
    for (const [key, item] of Object.entries(value)) {
      const cleaned = pruneEmpty(item);
      if (cleaned !== undefined) {
        cleanedObject[key] = cleaned;
      }
    }
    return Object.keys(cleanedObject).length > 0 ? cleanedObject : undefined;
  }

  if (value === '' || value === null || value === false) {
    return undefined;
  }

  return value;
}

async function convertHtmlToJson() {
  console.log('HTML → JSON Converter\n');
  console.log(`Source: ${SOURCE_HTML_DIR}`);
  console.log(`Output: ${OUTPUT_DATA_DIR}\n`);
  
  const startTime = Date.now();
  
  // Get all HTML files
  const files = fs.readdirSync(SOURCE_HTML_DIR)
    .filter(f => f.endsWith('.html'))
    .sort();
  
  console.log(`Found ${files.length} HTML files\n`);
  
  const results = {
    processed: 0,
    filesWithTerms: 0,
    totalTerms: 0,
    allDictionaries: []
  };
  
  for (const file of files) {
    const kodCode = extractDictionaryCodeFromFileName(file);
    if (!kodCode) {
      console.log(`⊘ Skipped (no kod code): ${file}`);
      continue;
    }
    
    const filePath = path.join(SOURCE_HTML_DIR, file);
    const html = fs.readFileSync(filePath, 'utf-8');
    
    const terms = extractTermsFromHtml(html);
    
    if (terms.length === 0) {
      console.log(`⊘ No terms found: kod_${kodCode}`);
      continue;
    }
    
    // Build complete output structure matching old format
    const metadata = extractDictionaryMetadata(html);
    const output = {
      dictionary_name: metadata.dictionaryName,
      dictionary_code: kodCode,
      year: metadata.year,
      terms_count: terms.length,
      terms: terms
    };

    const cleanedOutput = pruneEmpty(output);
    if (cleanedOutput) {
      // Keep a full in-memory list so we can emit one aggregated JSON array.
      results.allDictionaries.push(cleanedOutput);
    }
    
    results.processed++;
    results.filesWithTerms++;
    results.totalTerms += terms.length;
    
    console.log(`✓ kod_${kodCode}: ${terms.length} terms (${metadata.dictionaryName})`);
  }
  
  const elapsed = Date.now() - startTime;

  // Write one JSON file that contains an array of all dictionary objects.
  const aggregateOutputPath = path.join(OUTPUT_DATA_DIR, 'all-dictionaries.json');
  fs.writeFileSync(aggregateOutputPath, JSON.stringify(results.allDictionaries, null, 2));
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Conversion Summary:`);
  console.log(`  Dictionaries processed: ${results.filesWithTerms}`);
  console.log(`  Total terms extracted: ${results.totalTerms}`);
  console.log(`  Aggregated file: ${aggregateOutputPath}`);
  console.log(`  Elapsed time: ${elapsed}ms`);
  console.log(`${'='.repeat(60)}\n`);
  
  // Output sample from kod_161 if available
  const kod161Data = results.allDictionaries.find(d => d.dictionary_code === '161');
  if (kod161Data && Array.isArray(kod161Data.terms)) {
    const sample = kod161Data.terms.find(t => {
          if (!t.he || t.he.length === 0) return false;
          const variant = t.he[0];
      const primaryTerm = variant.terms && variant.terms.length > 0 ? variant.terms[0] : variant;
          return (primaryTerm.haser && primaryTerm.haser.includes('מֹחַל')) || 
            (primaryTerm.male && primaryTerm.male.includes('מוחל'));
    });
    
    if (sample) {
      console.log('Sample from kod_161:');
      console.log(JSON.stringify(sample, null, 2));
    }
  }
}

convertHtmlToJson().catch(err => {
  console.error('Error:', err.message);
  if (err && err.stack) console.error(err.stack);
  process.exit(1);
});
