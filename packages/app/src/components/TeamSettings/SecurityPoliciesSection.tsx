import { Box, Card, Text } from '@mantine/core';

import { Separator } from '@/components/Separator/Separator';

export default function SecurityPoliciesSection({
  allowedAuthMethods,
}: {
  allowedAuthMethods: string[];
}) {
  return (
    <Box id="security-policies">
      <Text size="md">Security Policies</Text>
      <Separator size="lg" />
      <Card>
        <Text size="sm" c="dimmed">
          Team members can only authenticate via{' '}
          <span className="text-capitalize fw-bold">
            {allowedAuthMethods.join(', ')}
          </span>
        </Text>
      </Card>
    </Box>
  );
}
