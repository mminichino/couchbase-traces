import { Group, Stack, Text } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/nextjs';

import { Badge, type BadgeState } from '@/components/Badge/Badge';
import { ContactSupportText } from '@/components/ContactSupportText';
import { Separator } from '@/components/Separator/Separator';

const STATES: BadgeState[] = [
  'default',
  'neutral',
  'info',
  'success',
  'warning',
  'danger',
  'disabled',
];

const meta: Meta<typeof Badge> = {
  title: 'Components/Badge',
  component: Badge,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    state: { control: 'select', options: STATES },
    size: { control: 'select', options: ['sm', 'md'] },
    type: { control: 'select', options: ['opaque', 'solid'] },
  },
};

export default meta;
type Story = StoryObj<typeof Badge>;

export const Playground: Story = {
  args: {
    text: 'Pending invite',
    state: 'neutral',
    size: 'sm',
    type: 'opaque',
    icon: 'dot',
  },
};

export const AllStates: Story = {
  render: () => (
    <Stack gap="xs">
      {(['opaque', 'solid'] as const).map(type => (
        <Group key={type} gap="xs">
          {STATES.map(state => (
            <Badge key={state} text={state} state={state} type={type} />
          ))}
        </Group>
      ))}
    </Stack>
  ),
};

export const Truncated: Story = {
  render: () => (
    <div style={{ width: 120 }}>
      <Badge text="service.name=checkout-frontend-production" state="info" />
    </div>
  ),
};

export const WithSeparatorAndLink: Story = {
  render: () => (
    <Stack gap={0} w={320}>
      <Text>Section above</Text>
      <Separator size="lg" />
      <Text>
        An error occurred. <ContactSupportText />
      </Text>
    </Stack>
  ),
};
