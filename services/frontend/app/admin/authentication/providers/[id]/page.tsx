'use client';

import OIDCProviderForm from '@/components/admin/OIDCProviderForm';
import { useParams } from 'next/navigation';

export default function EditOIDCProviderPage() {
    const params = useParams<{ id: string }>();
    return <OIDCProviderForm providerId={params.id} />;
}
