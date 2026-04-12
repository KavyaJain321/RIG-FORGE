import { PrismaClient } from '../node_modules/.pnpm/@prisma+client@5.16.1_prisma@5.16.1/node_modules/@prisma/client/index.js'

const prisma = new PrismaClient()

const DESCRIPTIONS = {
  'Open Source Intelligence (OSINT)': `An AI-powered intelligence platform that continuously scans, translates, and analyzes global open-source information to generate structured, decision-ready insights across news, social platforms, and government sources.

- Detects **emerging narratives**, geopolitical risks, and early warning indicators in real time
- Tracks maritime, institutional, and regional developments across multiple languages
- Monitors perception and influence patterns before they reach mainstream headlines
- Surfaces structured intelligence from niche communities and digital discourse`,

  'Conflict Coverage (CC)': `An AI-driven intelligence and content system that transforms fragmented global information streams into structured, decision-ready insights and high-impact communication assets for leadership and policy audiences.

- Ingests multilingual data from news, digital platforms, and institutional sources continuously
- Identifies **strategic risks**, emerging narratives, and early warning signals through pattern detection
- Converts raw intelligence into tailored content for public engagement and executive briefings
- Enables real-time awareness of national narratives and institutional perception shifts`,

  'Corruptx': `An AI-powered platform designed to detect, map, and analyze **corruption risk** across institutions, geographies, and information ecosystems using open-source data from news, regulatory records, and legal filings.

- Applies advanced pattern recognition to identify early indicators of misconduct and hidden actor relationships
- Tracks narrative shifts, information suppression, and reputational risks across jurisdictions
- Delivers clear, evidence-backed intelligence products for compliance and investigative use
- Monitors anomalies in financial disclosures, digital discourse, and institutional behavior`,

  'Child Safety Intelligence (Childsafe)': `An integrated intelligence and monitoring platform that identifies, assesses, and mitigates risks to children across physical, digital, and institutional environments using real-time data and advanced analytics.

- Detects early warning indicators from unsafe infrastructure and policy gaps to harmful online content
- Maps **risk exposure** across communities and monitors child safety narratives at scale
- Identifies systemic vulnerabilities and governance gaps for targeted intervention
- Supports governments, schools, civil society, and international bodies with evidence-based insights`,

  'Drone Mapping': `An advanced geospatial intelligence solution leveraging **drone-based imaging** and AI-driven analytics to accurately measure, map, and monitor built-up areas across urban and rural environments at scale.

- Generates precise 2D orthomosaics and 3D models via photogrammetry workflows
- Detects unauthorized construction, encroachments, and land-use changes automatically
- Supports infrastructure planning, compliance monitoring, and development taxation
- Maintains time-series data to track urban growth without reliance on manual surveys`,

  'Kashmir': `A powerful documentary exploring one of the world's most complex and enduring conflict zones through the lens of resilience, dialogue, and the human cost of division — moving beyond simplified geopolitical narratives.

- Illuminates **pathways toward peace** and coexistence through lived community realities
- Examines the role of state, society, and international actors across generations
- Presents multiple perspectives with depth, balance, and unflinching honesty
- Highlights the human dimension often erased from mainstream conflict discourse`,

  'Vanishing Voices': `A compelling documentary examining the gradual erosion of cultural, linguistic, and human narratives in a rapidly changing world — capturing communities and traditions at risk of being lost to conflict, displacement, or neglect.

- Preserves **marginalized voices** and stories before they disappear from living memory
- Explores the tension between progress and the preservation of identity and heritage
- Documents the impact of silence, displacement, and modernization on vulnerable communities
- Conveys the urgency of recording perspectives that may not survive another generation`,

  'The Corbett House (TCH)': `A digital gateway showcasing The Corbett House eco-resort experience through stunning visuals, intuitive navigation, and seamless functionality — reflecting the property's ethos of comfort, sustainability, and connection to nature.

- Showcases accommodations and **immersive nature experiences** with rich visual storytelling
- Integrates booking, inquiry, and reservation systems for seamless guest conversion
- Highlights sustainability initiatives, the organic jungle farm, and volunteer opportunities
- Delivers a fully responsive, content-rich platform for updates, media, and guest engagement`,

  'Imagery': `A systematic **visual repository initiative** capturing high-quality imagery across properties, products, events, and experiences to ensure stakeholders have access to consistent, organized, and versatile visual assets for all purposes.

- Provides complete visual coverage of all properties, experiences, and organizational touchpoints
- Creates story-driven content reflecting brand values for marketing and communications
- Optimizes assets across channels with structured categorization, tagging, and metadata workflows
- Supports operational documentation, internal reference, and long-term archiving needs`,

  'Daily News Letter (DNL)': `A dynamic, real-time **news distribution and intelligence engine** that delivers accurate, relevant, and timely news across multiple channels by merging automated aggregation, AI-assisted curation, and multi-platform publishing.

- Aggregates content from trusted global and local sources in real time
- Applies AI-powered curation to prioritize stories by relevance and editorial standards
- Distributes across website, mobile, social media, and newsletters with audience personalization
- Tracks engagement analytics and audience feedback to continuously refine the distribution strategy`,

  'Repositories': `A structured workflow for managing, monitoring, and optimizing **GitHub repositories** — enabling teams to maintain organized, secure, and production-ready codebases through systematic practices and automation.

- Enforces code integrity through branch management, semantic versioning, and PR workflows
- Maintains up-to-date documentation, READMEs, and changelogs for knowledge sharing
- Monitors CI/CD pipelines, security vulnerabilities, and dependency health continuously
- Tracks repository analytics and performs regular cleanup, access control, and backup routines`,

  'Belavida': `A digital gateway for Belavida – My Bed and Breakfast, combining elegance, usability, and immersive storytelling to showcase the property's hospitality, serene ambiance, and local charm to travelers seeking a unique Goa experience.

- Showcases **accommodations and amenities** through high-quality photography and visual narratives
- Provides seamless booking, inquiry tools, and responsive design across all devices
- Highlights Goa's local culture, experiences, and Belavida's boutique guest-centric positioning
- Conveys warmth and uniqueness through interactive visuals, testimonials, and curated storytelling`,

  'Windlass': `A centralized **global sales and information platform** combining elegant design, robust functionality, and strategic content to serve as both a marketing showcase and commercial engine for Windlass's full product range.

- Presents the complete product catalog with high-quality visuals and interactive browsing
- Drives lead generation and sales through integrated inquiry forms and contact portals
- Supports multilingual content and region-specific pages for international market reach
- Optimized for SEO, discoverability, and professional brand credibility across global audiences`,

  // Null descriptions
  'Social Media Posting': null,
  'Stance': null,
  'Video Editing & Integration': null,
  'News Prism': null,
}

async function main() {
  console.log('\n═══════════════════════════════════════')
  console.log('TASK 5A — INSERT PROJECT DESCRIPTIONS')
  console.log('═══════════════════════════════════════\n')

  let updated = 0
  let nulled = 0
  let notFound = 0

  for (const [projectName, description] of Object.entries(DESCRIPTIONS)) {
    const project = await prisma.project.findFirst({
      where: { name: { equals: projectName, mode: 'insensitive' }, isActive: true },
    })

    if (!project) {
      console.log(`  ❌ NOT FOUND: "${projectName}"`)
      notFound++
      continue
    }

    await prisma.project.update({
      where: { id: project.id },
      data: { description: description },
    })

    if (description === null) {
      console.log(`  Set NULL description: "${projectName}"`)
      nulled++
    } else {
      const preview = description.slice(0, 60).replace(/\n/g, ' ')
      console.log(`  Inserted description: "${projectName}" → "${preview}..."`)
      updated++
    }
  }

  console.log(`\nDescriptions inserted: ${updated} | Set to null: ${nulled} | Not found: ${notFound}`)
  console.log('\n✅ DONE — TASK 5A COMPLETE')
}

main()
  .catch((e) => { console.error('FATAL:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
