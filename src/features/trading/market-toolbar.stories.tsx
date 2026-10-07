import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { MarketToolbar } from './market-toolbar';
import { useScenario } from '../../../.storybook/scenario';
import { reconcileUnknown, signCalls } from '../../../.storybook/mocks/trade';
const meta = {
  title: 'Trading/Saved transaction toolbar', component: MarketToolbar,
  beforeEach() {
    useScenario.setState({ connected:true, tradeState:{stage:'error',unknownSubmission:true,message:'Submission outcome is unknown. Check your wallet activity.'} });
  },
} satisfies Meta<typeof MarketToolbar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Recovery: Story = {
  play: async ({canvas,userEvent}) => {
    await expect(canvas.getByRole('heading',{name:'Check an unknown submission'})).toBeVisible();
    await userEvent.click(canvas.getByLabelText(/My wallet confirms/));
    await userEvent.click(canvas.getByRole('button',{name:'Clear unsubmitted attempt'}));
    await expect(reconcileUnknown).toHaveBeenCalledWith({confirmedNotSubmitted:true});
    await expect(canvas.queryByRole('heading',{name:'Check an unknown submission'})).not.toBeInTheDocument();
    await expect(signCalls).not.toHaveBeenCalled();
  },
};
export const Mobile: Story = { globals: { viewport: { value:'narrow', isRotated:false } } };
