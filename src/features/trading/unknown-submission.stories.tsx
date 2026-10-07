import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn } from 'storybook/test';
import { UnknownSubmission } from './unknown-submission';
const meta = {
  title: 'Trading/Unknown submission recovery', component: UnknownSubmission,
  args: { onReconcile: fn(async () => {}), busy: false },
  decorators: [(Story) => <div className="max-w-xl"><Story /></div>],
} satisfies Meta<typeof UnknownSubmission>;
export default meta;
type Story = StoryObj<typeof meta>;
export const VerifiedHash: Story = {
  play: async ({ canvas, userEvent, args }) => {
    const submit = canvas.getByRole('button', { name: 'Verify transaction and check status' });
    await expect(submit).toBeDisabled();
    await userEvent.type(canvas.getByLabelText('Transaction hash from your wallet'), '0x123');
    await userEvent.click(canvas.getByLabelText(/This is the transaction for this action/));
    await userEvent.click(submit);
    await expect(args.onReconcile).toHaveBeenCalledWith({ transactionHash: '0x123' });
  },
};
export const NotSubmitted: Story = {
  play: async ({ canvas, userEvent, args }) => {
    const release = canvas.getByRole('button', { name: 'Clear unsubmitted attempt' });
    await expect(release).toBeDisabled();
    await userEvent.click(canvas.getByLabelText(/My wallet confirms/));
    await userEvent.click(release);
    await expect(args.onReconcile).toHaveBeenCalledWith({ confirmedNotSubmitted: true });
  },
};
export const LookupFailed: Story = {
  args: { onReconcile: fn(async () => { throw new Error('Transaction verification is unavailable. Your saved attempt is still locked.'); }) },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText('Transaction hash from your wallet'), '0x123');
    await userEvent.click(canvas.getByLabelText(/This is the transaction for this action/));
    await userEvent.click(canvas.getByRole('button', { name: 'Verify transaction and check status' }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent('still locked');
    await expect(canvas.getByLabelText('Transaction hash from your wallet')).toHaveValue('0x123');
  },
};
export const Verifying: Story = { args: { busy: true } };
export const Mobile: Story = { globals: { viewport: { value: 'narrow', isRotated: false } } };
