type Props = { family: string[][]; resources: string[][] }

const FAMILY_META: Record<string, string> = {
  준호: '41세 · 남성',
  한준호: '41세 · 남성',
  서윤: '39세 · 여성',
  민석: '15세 · 남성',
  정호: '68세 · 남성',
}

export function StatusPanels({ family, resources }: Props) {
  return <section className="status-panels" aria-label="현재 상태">
    <article><h2>FAMILY</h2>{family.map(([name, location]) => <p key={name}><strong>{name}{FAMILY_META[name] ? ` · ${FAMILY_META[name]}` : ''}</strong><span>{location}</span></p>)}</article>
    <article><h2>RESOURCE</h2>{resources.map(([name, state]) => <p key={name}><strong>{name}</strong><span>{state}</span></p>)}</article>
  </section>
}
