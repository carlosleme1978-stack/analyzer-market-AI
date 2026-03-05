import { redirect } from 'next/navigation'

export default function StatusIndex({ searchParams }: { searchParams: { token?: string } }) {
  if (!searchParams?.token) redirect('/')
  redirect(`/status/${encodeURIComponent(searchParams.token)}`)
}
