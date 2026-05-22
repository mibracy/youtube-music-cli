import {useState, useEffect} from 'react';
import {useStdout} from 'ink';

export function useTerminalSize() {
	const {stdout} = useStdout();
	const [size, setSize] = useState({
		columns: stdout?.columns || 80,
		rows: stdout?.rows || 24,
	});

	useEffect(() => {
		if (!stdout) return;

		const onResize = () => {
			process.stdout.write('\x1b[2J');
			setSize({
				columns: stdout.columns,
				rows: stdout.rows,
			});
		};

		stdout.on('resize', onResize);
		return () => {
			stdout.off('resize', onResize);
		};
	}, [stdout]);

	return size;
}
