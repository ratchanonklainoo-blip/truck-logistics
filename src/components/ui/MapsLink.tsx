import { ExternalLink } from 'lucide-react';
import { googleMapsUrl } from '@/lib/utils';

interface Props {
  lat: number;
  lng: number;
  className?: string;
  label?: string;
}

export default function MapsLink({ lat, lng, className, label }: Props) {
  return (
    <a
      href={googleMapsUrl(lat, lng)}
      target="_blank"
      rel="noopener noreferrer"
      title="เปิดใน Google Maps"
      className={className ?? 'inline-flex items-center gap-0.5 text-blue-600 hover:text-blue-700 hover:underline'}
    >
      <ExternalLink className="w-3 h-3" />
      {label}
    </a>
  );
}
