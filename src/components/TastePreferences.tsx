'use client';
import { useState } from 'react';
import type { MenuItem } from '@/lib/domain';
import type { Restaurant, TasteProfile } from '@/lib/taste';

type Props = { mode: 'fixture' | 'live'; profile: TasteProfile | null; seeds: Restaurant[]; menu: MenuItem[]; disabled: boolean; onChange: (profile: TasteProfile | null) => void; onSelectionChange: (seeds: Restaurant[]) => void; onBusy: (busy: boolean) => void };
async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'This request could not be completed.');
  return data;
}
export function TasteEvidence({ profile, menu }: { profile: TasteProfile; menu: MenuItem[] }) {
  return <div className="taste-evidence">
    <p><strong>{profile.mode === 'live' ? 'Live Qloo taste profile' : 'Simulated taste profile — not Qloo output'}</strong></p>
    <p>Selected: {profile.seeds.map(s => s.name).join(' + ')}.</p>
    <p>Returned cuisine associations: {profile.cuisines.length ? profile.cuisines.map(c => c.name).join(', ') : 'None recognised.'}</p>
    {profile.matches.length ? <ul>{profile.matches.map(match => <li key={match.itemId}><strong>{menu.find(m => m.id === match.itemId)?.name}</strong> · {match.cuisines.join(', ')}<span className="meal-help">{match.reason}</span></li>)}</ul> : <p>No returned cuisine has a house mapping to this menu. Taste will not change the price-first allocation. Try another restaurant or continue without a taste preference.</p>}
    <p className="subtle">These broad mappings are authored by GroupTable. Qloo has not rated the fictional meals. Affinity is not a probability that a person will like a meal. Dietary requirements remain separate.</p>
  </div>;
}
export default function TastePreferences({ mode, profile, seeds: selected, menu, disabled, onChange, onSelectionChange, onBusy }: Props) {
  const [query, setQuery] = useState(mode === 'fixture' ? 'Example' : '');
  const [results, setResults] = useState<Restaurant[] | null>(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  async function run(fn: () => Promise<void>) {
    setError(''); setWorking(true); onBusy(true);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Taste lookup failed. You can continue without it.'); }
    finally { setWorking(false); onBusy(false); }
  }
  return <section className="taste-preferences" aria-labelledby="taste-title">
    <h3 id="taste-title">What does the group enjoy?</h3>
    <p className="subtle">Optional: select up to three favourite restaurant branches as a shared starting point. This does not measure agreement between guests.</p>
    <p className="subtle">{mode === 'fixture' ? 'Fixture mode: search “Example” to try invented restaurants. No Qloo requests are made.' : 'Live Qloo: searches send restaurant names only. Lookups happen when you press a button.'}</p>
    <fieldset disabled={disabled || working} className="plain-fieldset">
      <label htmlFor="restaurant-search">Favourite restaurant name</label>
      <div className="taste-search"><input id="restaurant-search" value={query} maxLength={100} onChange={e => setQuery(e.target.value)} placeholder="e.g. Din Tai Fung" /><button className="button secondary" disabled={query.trim().length < 2} onClick={() => void run(async () => { const data = await post<{ restaurants: Restaurant[] }>('/api/taste/search', { query }); setResults(data.restaurants); })}>{working ? 'Looking up…' : 'Search restaurants'}</button></div>
      {results && !results.length && <p role="status">No restaurant branches found. Try a broader name, or continue without taste preferences.</p>}
      {results && results.length > 0 && <ul className="taste-results">{results.map(restaurant => <li key={restaurant.id}><div><strong>{restaurant.name}</strong><span className="meal-help">{restaurant.address}</span></div><button className="button small secondary" disabled={selected.length >= 3 || selected.some(s => s.id === restaurant.id)} aria-label={`Select ${restaurant.name}, ${restaurant.address}`} onClick={() => { onSelectionChange([...selected, restaurant]); onChange(null); }}>{selected.some(s => s.id === restaurant.id) ? 'Selected' : 'Select'}</button></li>)}</ul>}
      {selected.length > 0 && <div className="taste-selected"><p>Selected branches</p><ul>{selected.map(restaurant => <li key={restaurant.id}><span>{restaurant.name}<span className="meal-help">{restaurant.address}</span></span><button className="text-button" aria-label={`Remove ${restaurant.name} taste seed`} onClick={() => { onSelectionChange(selected.filter(s => s.id !== restaurant.id)); onChange(null); }}>Remove</button></li>)}</ul></div>}
      <div className="taste-actions"><button className="button secondary" disabled={!selected.length} onClick={() => void run(async () => onChange(await post<TasteProfile>('/api/taste/profile', { ids: selected.map(s => s.id) })))}>{mode === 'fixture' ? 'Build simulated taste profile' : 'Build Qloo taste profile'}</button>{(profile || selected.length > 0) && <button className="text-button" onClick={() => { onSelectionChange([]); onChange(null); }}>Clear taste preferences</button>}</div>
    </fieldset>
    <div aria-live="polite">{error && <p className="message error" role="alert">{error} You can clear taste preferences and continue.</p>}{profile && <TasteEvidence profile={profile} menu={menu} />}</div>
  </section>;
}
