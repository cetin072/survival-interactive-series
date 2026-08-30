type Props = { family: string[][]; resources: string[][] }

export function StatusPanels({ family, resources }: Props) {
  return <section className="status-panels" aria-label="현재 상태">
    <article><h2>FAMILY</h2>{family.map(([name, location]) => <p key={name}><strong>{name}</strong><span>{location}</span></p>)}</article>
    <article><h2>RESOURCE</h2>{resources.map(([name, state]) => <p key={name}><strong>{name}</strong><span>{state}</span></p>)}</article>
  </section>
}
