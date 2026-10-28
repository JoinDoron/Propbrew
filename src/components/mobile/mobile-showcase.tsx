'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Bell, Building2, CalendarDays, Check, ChevronRight, CircleHelp, CreditCard, FileText, Home, KeyRound, LockKeyhole, MessageCircle, Plus, Receipt, Search, Send, Shield, Sparkles, UserRound, UsersRound, Wrench } from 'lucide-react';
import styles from './mobile-showcase.module.css';
import navStyles from './mobile-nav.module.css';

type Screen = 'welcome'|'home'|'payments'|'visitors'|'requests'|'community'|'documents'|'profile';
const SCREENS: { id: Screen; label: string; eyebrow: string }[] = [
  { id: 'welcome', label: 'Welcome', eyebrow: '01' }, { id: 'home', label: 'Home', eyebrow: '02' },
  { id: 'payments', label: 'Bills & payments', eyebrow: '03' }, { id: 'visitors', label: 'Visitors & gate', eyebrow: '04' },
  { id: 'requests', label: 'Maintenance', eyebrow: '05' }, { id: 'community', label: 'Community', eyebrow: '06' },
  { id: 'documents', label: 'Documents', eyebrow: '07' }, { id: 'profile', label: 'Profile & privacy', eyebrow: '08' },
];

const money = (minor: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(minor / 100);

export function MobileShowcase() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [paid, setPaid] = useState(false);
  const [visitors, setVisitors] = useState(['Delivery · Domino’s', 'Car · Uber']);
  const [requestSent, setRequestSent] = useState(false);
  const [dark, setDark] = useState(true);
  const current = useMemo(() => SCREENS.findIndex((item) => item.id === screen), [screen]);
  const go = (delta: number) => setScreen(SCREENS[Math.min(SCREENS.length - 1, Math.max(0, current + delta))].id);
  return <main className={`${styles.stage} ${dark ? styles.stageDark : styles.stageLight}`}>
    <section className={styles.deviceColumn} aria-label="Interactive Propbrew mobile preview">
      <div className={styles.phone}>
        <div className={styles.status}><strong>9:41</strong><span className={styles.island} /><span>▮▮▮ ᴡɪꜰɪ ▰</span></div>
        <div className={styles.viewport}>
          {screen === 'welcome' ? <Welcome onEnter={() => setScreen('home')} /> : null}
          {screen === 'home' ? <HomeScreen onNavigate={setScreen} /> : null}
          {screen === 'payments' ? <Payments paid={paid} onPay={() => setPaid(true)} onBack={() => setScreen('home')} /> : null}
          {screen === 'visitors' ? <Visitors visitors={visitors} onAdd={() => setVisitors((items) => [`Visitor · ${items.length + 1}`, ...items])} onBack={() => setScreen('home')} /> : null}
          {screen === 'requests' ? <Requests sent={requestSent} onSend={() => setRequestSent(true)} onBack={() => setScreen('home')} /> : null}
          {screen === 'community' ? <Community onBack={() => setScreen('home')} /> : null}
          {screen === 'documents' ? <Documents onBack={() => setScreen('home')} /> : null}
          {screen === 'profile' ? <Profile onBack={() => setScreen('home')} /> : null}
          {screen !== 'welcome' ? <BottomNav screen={screen} onNavigate={setScreen} /> : null}
        </div>
        <div className={styles.homeIndicator} />
      </div>
      <p className={styles.caption}>Propbrew Estate · Resident app · iPhone 393×852 · {SCREENS[current].label}</p>
    </section>
    <aside className={styles.navigator} aria-label="Preview screens">
      <div><p className={styles.kicker}>PROPBREW ESTATE · NATIVE</p><h1>Resident life,<br/><em>beautifully managed.</em></h1><p className={styles.intro}>A clickable end-to-end preview of the Estate Management resident experience for iOS and Android. It connects to the same company, estate, block, unit, payment and maintenance records as Propbrew web.</p></div>
      <nav>{SCREENS.map((item) => <button key={item.id} className={screen === item.id ? styles.activeScreen : ''} onClick={() => setScreen(item.id)}><span>{item.eyebrow}</span>{item.label}<ChevronRight size={15}/></button>)}</nav>
      <div className={styles.previewControls}><button onClick={() => go(-1)} disabled={current === 0}><ArrowLeft size={16}/>Previous</button><button onClick={() => go(1)} disabled={current === SCREENS.length - 1}>Next<ArrowRight size={16}/></button></div>
      <label className={styles.themeToggle}><input type="checkbox" checked={dark} onChange={(event) => setDark(event.target.checked)}/><span/>Dark presentation</label>
      <p className={styles.liveNote}><span/> Interactive prototype · all actions stay inside this preview.</p>
    </aside>
  </main>;
}

function Welcome({ onEnter }: { onEnter(): void }) { return <div className={styles.welcome}>
  <div className={styles.logoMark}><Building2 size={24}/></div><p className={styles.brand}>Propbrew</p>
  <div className={styles.welcomeArt}><div className={styles.orbit}/><div className={styles.building}><span/><span/><span/></div><Sparkles size={30}/></div>
  <p className={styles.overline}>YOUR HOME, IN ONE PLACE</p><h2>Live lighter.<br/>Know what’s happening.</h2><p>Pay dues, welcome visitors, report repairs and stay connected to your community.</p>
  <button className={styles.primary} onClick={onEnter}>Enter your home <ArrowRight size={18}/></button><small>Securely connected to your Propbrew company account</small>
</div>; }

function Header({ title, onBack }: { title: string; onBack(): void }) { return <header className={styles.screenHeader}><button onClick={onBack} aria-label="Go back"><ArrowLeft size={20}/></button><strong>{title}</strong><button aria-label="Notifications"><Bell size={18}/><i/></button></header>; }

function HomeScreen({ onNavigate }: { onNavigate(screen: Screen): void }) { return <div className={styles.homeScreen}>
  <section className={styles.homeTop}><div className={styles.profileLine}><span className={styles.avatar}>CP</span><div><strong>Hello, Chris</strong><small>Riverdale Residency · Unit B12</small></div><button><MessageCircle size={18}/></button><button><Bell size={18}/><i/></button></div>
  <div className={styles.search}><Search size={18}/>Search your home</div><div className={styles.summaryGrid}><button onClick={() => onNavigate('payments')}><span>{money(450000)}</span><small>Outstanding dues</small><b><ChevronRight size={18}/></b></button><button onClick={() => onNavigate('visitors')}><span>01</span><small>Expected visitor</small><b><ChevronRight size={18}/></b></button></div></section>
  <section className={styles.darkBody}><div className={styles.pills}><button onClick={() => onNavigate('requests')}><CircleHelp size={17}/>Helpdesk</button><button onClick={() => onNavigate('documents')}><FileText size={17}/>Documents</button><button onClick={() => onNavigate('visitors')}><KeyRound size={17}/>Gate</button></div>
  <SectionTitle title="Announcements"/><article className={styles.announcement}><div><strong>Water maintenance</strong><span>2h ago</span></div><p>Tomorrow, water supply will be interrupted from 10 AM to 2 PM for planned maintenance.</p><button className={navStyles.announcementAction} onClick={() => onNavigate('community')}>Read update <ArrowRight size={16}/></button></article>
  <SectionTitle title="Quick actions"/><div className={styles.quick}><button onClick={() => onNavigate('visitors')}><UsersRound/><span>Add visitor</span></button><button onClick={() => onNavigate('requests')}><Wrench/><span>Report issue</span></button><button onClick={() => onNavigate('payments')}><Receipt/><span>Pay dues</span></button><button onClick={() => onNavigate('community')}><CalendarDays/><span>Book amenity</span></button></div></section>
</div>; }

function Payments({ paid, onPay, onBack }: { paid: boolean; onPay(): void; onBack(): void }) { return <div className={styles.lightScreen}><Header title="Payments" onBack={onBack}/><div className={styles.paymentPanel}><small>Total pending</small><h2>{paid ? money(0) : money(450000)}</h2><dl><div><dt>Maintenance fee</dt><dd>{money(350000)}</dd></div><div><dt>Parking fee</dt><dd>{money(100000)}</dd></div></dl><button onClick={onPay} disabled={paid}>{paid ? <><Check/>Payment recorded</> : <>Pay {money(450000)}</>}</button></div><h3>Payment method</h3><div className={styles.method}><CreditCard/><div><strong>Bank card</strong><small>Visa, Mastercard, Verve</small></div><span><Check/></span></div><div className={styles.method}><Building2/><div><strong>Bank transfer</strong><small>Dedicated virtual account</small></div><ChevronRight/></div><p className={styles.disclaimer}>Payment confirmation is reconciled against your company ledger. Propbrew does not hold customer funds.</p></div>; }

function Visitors({ visitors, onAdd, onBack }: { visitors: string[]; onAdd(): void; onBack(): void }) { return <div className={styles.lightScreen}><Header title="Gate updates" onBack={onBack}/><div className={styles.segment}><b>Visitors</b><span>Parcels</span><span>Helpers</span></div><h3>Expected visitors</h3><article className={styles.visitorHero}><div><small>QUICK ACCESS</small><strong>Pre-approve entry at the gate</strong><button onClick={onAdd}>Create visitor pass</button></div><Shield size={74}/></article><SectionTitle title="My visitors"/><div className={styles.visitorList}>{visitors.map((visitor, index) => <article key={`${visitor}-${index}`}><span className={styles.visitorAvatar}>{index ? '🚗' : '📦'}</span><div><strong>{visitor}</strong><small>Pre-approved by Chris</small></div><span className={styles.approved}><Check/> Approved</span></article>)}</div></div>; }

function Requests({ sent, onSend, onBack }: { sent: boolean; onSend(): void; onBack(): void }) { return <div className={styles.lightScreen}><Header title="Maintenance" onBack={onBack}/><div className={styles.requestHero}><Wrench/><small>HELPDESK</small><h2>What needs attention?</h2><p>Add a photo or voice note. We’ll show who is responsible before you submit.</p></div>{sent ? <div className={styles.success}><Check/><h3>Request PB-1042 raised</h3><p>Plumbing · priority response within 4 hours. You can follow every update here.</p></div> : <div className={styles.form}><label>Issue<input defaultValue="Leaking kitchen tap"/></label><label>Details<textarea defaultValue="Water continues dripping after the tap is closed."/></label><div className={styles.responsibility}><Shield/><div><strong>Likely landlord responsibility</strong><small>Based on the recorded agreement. A manager will confirm.</small></div></div><button className={styles.primary} onClick={onSend}>Send request <Send size={17}/></button></div>}</div>; }

function Community({ onBack }: { onBack(): void }) { return <div className={styles.lightScreen}><Header title="Community" onBack={onBack}/><div className={styles.search}><Search size={18}/>Search community</div><div className={styles.segment}><b>Today</b><span>Upcoming</span><span>History</span></div><article className={styles.post}><div><span className={styles.avatar}>AO</span><div><strong>Ada Okafor</strong><small>Block B · 18 min</small></div></div><b>Saturday family sports morning</b><p>Join us at the recreation lawn from 8 AM. Children and neighbours are welcome.</p><div><button>♡ 25</button><button>◌ 10</button><button>Share</button></div></article><article className={styles.eventCard}><CalendarDays/><div><strong>Pool booking</strong><small>Tomorrow · 4:00–5:00 PM</small></div><span>Confirmed</span></article><button className={styles.blackButton}><Plus/>Create post</button></div>; }

function Documents({ onBack }: { onBack(): void }) { return <div className={styles.lightScreen}><Header title="Documents" onBack={onBack}/><div className={styles.documentHero}><LockKeyhole/><h2>Your tenancy vault</h2><p>Receipts, agreements and inventory records stay available offline.</p></div>{['Tenancy agreement · 2026','Service charge receipt · Q3','Move-in inventory & photos','Estate rules and safety guide'].map((name, index) => <article className={styles.documentRow} key={name}><FileText/><div><strong>{name}</strong><small>{index < 2 ? 'Verified record' : 'Available offline'}</small></div><ChevronRight/></article>)}</div>; }

function Profile({ onBack }: { onBack(): void }) { return <div className={styles.profileScreen}><div className={styles.profileHead}><Header title="Profile" onBack={onBack}/></div><div className={styles.profileBody}><div className={styles.profileHero}><span className={styles.largeAvatar}>CP</span><h2>Chris Pradana</h2><p>chris.pradana@example.com</p><small>Riverdale Residency · Unit B12</small></div>{[[UserRound,'Edit profile','Update household information'],[Bell,'Notifications','Quiet hours and emergency overrides'],[Shield,'Privacy & security','Consent, biometrics and your data'],[CircleHelp,'Help & support','Recorded support and dispute trail']].map(([Icon,title,copy]) => <button className={styles.profileRow} key={String(title)}><span><Icon/></span><div><strong>{String(title)}</strong><small>{String(copy)}</small></div><ChevronRight/></button>)}</div></div>; }

function SectionTitle({ title }: { title: string }) { return <div className={styles.sectionTitle}><h3>{title}</h3><button>View all</button></div>; }
function BottomNav({ screen, onNavigate }: { screen: Screen; onNavigate(screen: Screen): void }) { const items: [Screen, typeof Home][] = [['home',Home],['payments',Receipt],['visitors',UsersRound],['community',MessageCircle],['profile',UserRound]]; return <nav className={`${styles.bottomNav} ${navStyles.bottomNav}`} aria-label="Mobile navigation">{items.map(([id, Icon]) => <button key={id} aria-label={id} className={screen === id ? styles.selectedNav : ''} onClick={() => onNavigate(id)}><Icon size={19}/></button>)}</nav>; }
