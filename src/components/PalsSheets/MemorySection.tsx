import React, {useContext} from 'react';
import {View} from 'react-native';
import {Switch, Text} from 'react-native-paper';
import {Controller, useFormContext} from 'react-hook-form';

import {useTheme} from '../../hooks';
import {L10nContext} from '../../utils';
import {SectionDivider} from './SectionDivider';
import {createStyles} from './styles';
import type {PalFormData} from './types';

export const MemorySection = () => {
  const {control} = useFormContext<PalFormData>();
  const theme = useTheme();
  const styles = createStyles(theme);
  const l10n = useContext(L10nContext);
  const copy = l10n.components.palSheet.memory;

  return (
    <View testID="memory-section">
      <SectionDivider label={copy.sectionLabel} />
      <Controller
        control={control}
        name="memoryEnabled"
        render={({field: {onChange, value}}) => (
          <View style={styles.talentItem}>
            <View style={styles.talentInfo}>
              <Text variant="bodyMedium">{copy.title}</Text>
              <Text variant="bodySmall" style={styles.talentDescription}>
                {copy.description}
              </Text>
            </View>
            <Switch
              testID="memory-capability-switch"
              value={value === true}
              onValueChange={onChange}
            />
          </View>
        )}
      />
    </View>
  );
};
