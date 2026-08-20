import React from 'react';
import {FormProvider, useForm} from 'react-hook-form';

import {fireEvent, render, waitFor} from '../../../../jest/test-utils';
import {l10n} from '../../../locales';
import {L10nContext} from '../../../utils';
import {MemorySection} from '../MemorySection';
import type {PalFormData} from '../types';

const FormWrapper = ({
  memoryEnabled = false,
  onFormValues,
}: {
  memoryEnabled?: boolean;
  onFormValues?: (getValues: () => PalFormData) => void;
}) => {
  const methods = useForm<PalFormData>({
    defaultValues: {name: '', memoryEnabled},
  });

  React.useEffect(() => {
    onFormValues?.(methods.getValues as () => PalFormData);
  }, [methods, onFormValues]);

  return (
    <L10nContext.Provider value={l10n.en}>
      <FormProvider {...methods}>
        <MemorySection />
      </FormProvider>
    </L10nContext.Provider>
  );
};

describe('MemorySection', () => {
  it('renders persistent-memory copy and its switch', () => {
    const {getByText, getByTestId} = render(<FormWrapper />);

    expect(getByText(l10n.en.components.palSheet.memory.title)).toBeTruthy();
    expect(getByTestId('memory-capability-switch')).toBeTruthy();
  });

  it('writes the enabled state into the Pal form', async () => {
    let getFormValues: () => PalFormData;
    const {getByTestId} = render(
      <FormWrapper
        onFormValues={getValues => {
          getFormValues = getValues;
        }}
      />,
    );

    fireEvent(getByTestId('memory-capability-switch'), 'valueChange', true);

    await waitFor(() => {
      expect(getFormValues!().memoryEnabled).toBe(true);
    });
  });
});
